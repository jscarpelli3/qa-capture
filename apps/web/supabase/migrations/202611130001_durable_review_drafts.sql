alter table public.reviews
  add column resume_secret_hash text,
  add column draft_revision bigint not null default 0 check (draft_revision >= 0),
  add column draft_updated_at timestamptz;

create table public.review_notes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  note_id text not null,
  sequence integer not null check (sequence between 1 and 200),
  kind text not null,
  note_text text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, note_id)
);

create index review_notes_review_sequence_idx
  on public.review_notes(review_id, sequence);

create table public.review_assets (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  asset_id text not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  file_size integer not null check (file_size > 0 and file_size <= 2097152),
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, asset_id)
);

create index review_assets_review_id_idx on public.review_assets(review_id);

alter table public.review_notes enable row level security;
alter table public.review_assets enable row level security;

create policy "members can read review notes" on public.review_notes
for select using (exists (
  select 1
  from public.reviews r
  join public.projects p on p.id = r.project_id
  where r.id = review_id and public.is_organization_member(p.organization_id)
));

create policy "members can read review assets" on public.review_assets
for select using (exists (
  select 1
  from public.reviews r
  join public.projects p on p.id = r.project_id
  where r.id = review_id and public.is_organization_member(p.organization_id)
));

comment on column public.reviews.resume_secret_hash is
  'Hash of the long-lived, review-specific credential used to restore and refresh a draft.';
comment on table public.review_notes is
  'Server-saved editable QA notes retained while a review is in progress.';
comment on table public.review_assets is
  'Private Blob metadata for screenshots saved before final review submission.';
