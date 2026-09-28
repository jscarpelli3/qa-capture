create extension if not exists pgcrypto;

create type public.organization_role as enum ('owner', 'admin');
create type public.invitation_status as enum ('draft', 'queued', 'sent', 'opened', 'started', 'submitted', 'partially_used', 'exhausted', 'expired', 'revoked', 'delivery_failed');
create type public.review_status as enum ('created', 'uploading', 'uploaded', 'validating', 'approved', 'rejected', 'delivering', 'delivered', 'delivery_failed');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  public_key text not null unique,
  environment_label text,
  created_at timestamptz not null default now()
);

create table public.project_origins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  origin text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, origin)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  secret_hash text not null unique,
  staging_url text not null,
  status public.invitation_status not null default 'draft',
  expires_at timestamptz not null,
  max_reviews integer not null default 1 check (max_reviews between 1 and 100),
  accepted_reviews integer not null default 0 check (accepted_reviews >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invitation_id uuid references public.invitations(id) on delete set null,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_email text,
  status public.review_status not null default 'created',
  package_nonce_hash text not null,
  package_nonce_consumed_at timestamptz,
  quarantine_path text unique,
  approved_path text unique,
  canonical_sha256 text,
  note_count integer check (note_count >= 0),
  rejection_code text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  subject_type text not null,
  subject_id text not null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index projects_organization_id_idx on public.projects(organization_id);
create index invitations_project_id_idx on public.invitations(project_id);
create index reviews_project_id_created_at_idx on public.reviews(project_id, created_at desc);
create index audit_events_organization_id_created_at_idx on public.audit_events(organization_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_origins enable row level security;
alter table public.invitations enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = auth.uid()
  );
$$;

create policy "members can read organizations" on public.organizations for select using (public.is_organization_member(id));
create policy "members can read memberships" on public.organization_members for select using (public.is_organization_member(organization_id));
create policy "members can read projects" on public.projects for select using (public.is_organization_member(organization_id));
create policy "members can read origins" on public.project_origins for select using (exists (
  select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)
));
create policy "members can read invitations" on public.invitations for select using (exists (
  select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)
));
create policy "members can read reviews" on public.reviews for select using (exists (
  select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)
));
create policy "members can read audit events" on public.audit_events for select using (public.is_organization_member(organization_id));
