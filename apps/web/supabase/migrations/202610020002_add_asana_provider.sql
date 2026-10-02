alter type public.integration_provider add value if not exists 'asana';

-- QAWELL currently routes a review to one destination. Enforce that invariant
-- in the database before additional providers can be connected.
create unique index if not exists project_integrations_one_active_destination_idx
  on public.project_integrations (project_id)
  where status = 'active';
