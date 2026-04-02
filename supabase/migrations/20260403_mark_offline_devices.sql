-- Mark devices offline when they stop heartbeating.
-- Run this in Supabase SQL Editor or via migrations.

create extension if not exists pg_cron;

create or replace function public.mark_offline_devices()
returns void
language plpgsql
security definer
as $$
begin
  update public.device_status
     set online = false
   where online = true
     and last_seen < (now() at time zone 'utc' - interval '2 minutes');
end;
$$;

do $$
begin
  if not exists (
    select 1
      from cron.job
     where jobname = 'mark-offline-devices'
  ) then
    perform cron.schedule(
      'mark-offline-devices',
      '*/1 * * * *',
      $q$select public.mark_offline_devices();$q$
    );
  end if;
end
$$;
