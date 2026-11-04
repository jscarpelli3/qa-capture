alter table public.invitations
  add column link_type text not null default 'individual'
    check (link_type in ('individual', 'shared')),
  alter column email drop not null,
  alter column expires_at drop not null,
  alter column max_reviews drop not null;

create unique index invitations_one_shared_link_per_project_idx
  on public.invitations(project_id)
  where link_type = 'shared';

alter table public.invitations
  add constraint invitations_link_shape_check check (
    (link_type = 'individual' and email is not null and expires_at is not null and max_reviews is not null)
    or
    (link_type = 'shared' and email is null and reviewer_name is null and expires_at is null and max_reviews is null)
  );

comment on column public.invitations.link_type is
  'Individual preserves legacy single-review invitations. Shared is the reusable, rotatable project QA link.';
