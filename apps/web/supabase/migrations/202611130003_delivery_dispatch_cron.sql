create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_qawell_delivery_jobs()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  dispatch_secret text;
  request_id bigint;
begin
  select decrypted_secret
  into dispatch_secret
  from vault.decrypted_secrets
  where name = 'qawell_delivery_dispatch_secret';

  if dispatch_secret is null then
    raise warning 'QAWELL delivery dispatch secret is not configured';
    return null;
  end if;

  select net.http_get(
    url := 'https://qawell.dev/api/internal/delivery-dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || dispatch_secret),
    timeout_milliseconds := 30000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.dispatch_qawell_delivery_jobs() from public, anon, authenticated;
grant execute on function public.dispatch_qawell_delivery_jobs() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'qawell-delivery-dispatch';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('qawell-delivery-dispatch', '*/5 * * * *', 'select public.dispatch_qawell_delivery_jobs()');
end;
$$;

comment on function public.dispatch_qawell_delivery_jobs() is
  'Supabase Cron safety net that republishes durable delivery jobs whose initial Vercel Queue publish was not confirmed.';
