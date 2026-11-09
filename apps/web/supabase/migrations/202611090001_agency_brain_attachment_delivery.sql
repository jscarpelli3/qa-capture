alter table public.review_deliveries
  add column attachment_count integer not null default 0 check (attachment_count >= 0),
  add column attachments_delivered integer not null default 0 check (attachments_delivered >= 0),
  add column attachments_failed integer not null default 0 check (attachments_failed >= 0),
  add constraint review_deliveries_attachment_totals_check
    check (attachments_delivered + attachments_failed <= attachment_count);

comment on column public.review_deliveries.attachment_count is
  'Validated screenshots QAWELL attempted to attach to the external record.';
comment on column public.review_deliveries.attachments_delivered is
  'Screenshots accepted by the external provider.';
comment on column public.review_deliveries.attachments_failed is
  'Screenshots that failed without failing the already-created text ticket.';
