alter type public.review_status add value if not exists 'queued' after 'approved';

create table public.review_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  note_id text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'retry_scheduled', 'succeeded', 'permanent_failure')),
  attempts integer not null default 0 check (attempts >= 0),
  queue_message_id text,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  last_error_message text,
  processing_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, note_id)
);

create index review_delivery_jobs_ready_idx
  on public.review_delivery_jobs(status, next_attempt_at)
  where status in ('queued', 'retry_scheduled');

alter table public.review_delivery_jobs enable row level security;

create table public.review_delivery_attachments (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.review_deliveries(id) on delete cascade,
  asset_id text not null,
  status text not null default 'queued' check (status in ('queued', 'delivering', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  external_id text,
  error_code text,
  attempted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_id, asset_id)
);

alter table public.review_delivery_attachments enable row level security;

create policy "members can read delivery jobs" on public.review_delivery_jobs
for select using (exists (
  select 1
  from public.reviews r
  join public.projects p on p.id = r.project_id
  where r.id = review_id and public.is_organization_member(p.organization_id)
));

create policy "members can read delivery attachments" on public.review_delivery_attachments
for select using (exists (
  select 1
  from public.review_deliveries d
  join public.reviews r on r.id = d.review_id
  join public.projects p on p.id = r.project_id
  where d.id = delivery_id and public.is_organization_member(p.organization_id)
));

create or replace function public.claim_review_delivery_job(job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('qawell_review_delivery'));

  if exists (
    select 1
    from public.review_delivery_jobs
    where status = 'processing'
      and processing_started_at > now() - interval '5 minutes'
      and id <> job_id
  ) then
    return false;
  end if;

  update public.review_delivery_jobs
  set status = 'processing',
      attempts = attempts + 1,
      processing_started_at = now(),
      updated_at = now(),
      last_error_code = null,
      last_error_message = null
  where id = job_id
    and status in ('queued', 'retry_scheduled', 'processing')
    and (status <> 'processing' or processing_started_at <= now() - interval '5 minutes')
    and next_attempt_at <= now();

  return found;
end;
$$;

revoke all on function public.claim_review_delivery_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_review_delivery_job(uuid) to service_role;

comment on table public.review_delivery_jobs is
  'Durable, inspectable delivery ledger. Vercel Queue messages wake workers; this table remains authoritative.';
comment on table public.review_delivery_attachments is
  'Per-screenshot delivery state so retries never re-upload screenshots already accepted by the provider.';
