alter table public.projects
  add column site_mode text not null default 'regular'
    check (site_mode in ('regular', 'shopify_preview')),
  add column current_site_url text,
  add column shopify_store_id text
    check (shopify_store_id is null or shopify_store_id ~ '^[0-9]+$');

update public.projects p
set current_site_url = (
  select po.origin
  from public.project_origins po
  where po.project_id = p.id
  order by po.created_at asc
  limit 1
)
where p.current_site_url is null
  and exists (select 1 from public.project_origins po where po.project_id = p.id);

alter table public.projects
  add constraint projects_shopify_preview_config_check check (
    (site_mode = 'regular' and shopify_store_id is null)
    or
    (site_mode = 'shopify_preview' and shopify_store_id is not null)
  );

comment on column public.projects.current_site_url is
  'The current reviewer destination. Shopify preview projects may update this without replacing invitation links.';
comment on column public.projects.shopify_store_id is
  'Pins Shopify preview authorization to one numeric store ID while allowing the rotating host token.';
