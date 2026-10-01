create type public.integration_provider as enum ('agency_brain', 'sifter');
create type public.integration_status as enum ('pending', 'active', 'error', 'disabled');

create table public.project_integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider public.integration_provider not null,
  status public.integration_status not null default 'pending',
  external_project_id text,
  external_project_name text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, provider)
);

-- This table is deliberately unreadable through the public Data API. Only the
-- server-side service role may access encrypted integration credentials.
create table public.integration_credentials (
  integration_id uuid primary key references public.project_integrations(id) on delete cascade,
  encrypted_secret text not null,
  updated_at timestamptz not null default now()
);

alter table public.project_integrations enable row level security;
alter table public.integration_credentials enable row level security;

create policy "members can read integrations" on public.project_integrations
for select using (exists (
  select 1 from public.projects p
  where p.id = project_id and public.is_organization_member(p.organization_id)
));

create policy "members can create projects" on public.projects
for insert with check (public.is_organization_member(organization_id));

create policy "members can update projects" on public.projects
for update using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy "members can create origins" on public.project_origins
for insert with check (exists (
  select 1 from public.projects p
  where p.id = project_id and public.is_organization_member(p.organization_id)
));

create or replace function public.bootstrap_organization(organization_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select organization_id into existing_id
  from public.organization_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  if char_length(trim(organization_name)) not between 1 and 160 then
    raise exception 'Organization name must be between 1 and 160 characters';
  end if;

  insert into public.organizations (name)
  values (trim(organization_name))
  returning id into new_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$$;

revoke all on function public.bootstrap_organization(text) from public;
grant execute on function public.bootstrap_organization(text) to authenticated;
