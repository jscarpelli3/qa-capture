alter table public.invitations
  add column reviewer_name text,
  add column submitted_at timestamptz;

alter table public.reviews
  add column source_review_id text,
  add column reviewer_name text,
  add column upload_expires_at timestamptz,
  add column delivery_mode text not null default 'download' check (delivery_mode in ('download', 'integration'));

create unique index reviews_project_source_review_idx
  on public.reviews(project_id, source_review_id)
  where source_review_id is not null;

create table public.review_deliveries (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  integration_id uuid not null references public.project_integrations(id) on delete cascade,
  note_id text not null,
  status text not null check (status in ('pending', 'delivering', 'delivered', 'failed')),
  external_id text,
  external_label text,
  error_code text,
  attempted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (review_id, integration_id, note_id)
);

create index review_deliveries_review_id_idx on public.review_deliveries(review_id);
alter table public.review_deliveries enable row level security;

create policy "members can update organizations" on public.organizations
for update using (public.is_organization_member(id))
with check (public.is_organization_member(id));

create policy "members can update origins" on public.project_origins
for update using (exists (
  select 1 from public.projects p
  where p.id = project_id and public.is_organization_member(p.organization_id)
)) with check (exists (
  select 1 from public.projects p
  where p.id = project_id and public.is_organization_member(p.organization_id)
));

create policy "members can read deliveries" on public.review_deliveries
for select using (exists (
  select 1
  from public.reviews r
  join public.projects p on p.id = r.project_id
  where r.id = review_id and public.is_organization_member(p.organization_id)
));

create policy "members can create invitations" on public.invitations
for insert with check (exists (
  select 1 from public.projects p
  where p.id = project_id and public.is_organization_member(p.organization_id)
));

create policy "members can update invitations" on public.invitations
for update using (exists (
  select 1 from public.projects p
  where p.id = project_id and public.is_organization_member(p.organization_id)
)) with check (exists (
  select 1 from public.projects p
  where p.id = project_id and public.is_organization_member(p.organization_id)
));
