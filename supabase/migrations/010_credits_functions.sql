-- Credit metering functions. Run in the Supabase SQL editor AFTER 009. Idempotent.
--
-- 1. consume_credits was created by hand on the live DB and never committed. This is the live
--    definition, plus a guard on p_cost and an explicit UTC month boundary.
-- 2. SECURITY: functions in `public` are executable by anon/authenticated by default, and
--    PostgREST exposes them at /rest/v1/rpc/<name>. consume_credits is SECURITY DEFINER and
--    takes p_user_id from the caller, so any signed-in user could call it with a negative
--    p_cost (free credits) or with someone else's user id (burn their credits). Only the
--    backend (service_role) may call these.
-- 3. credits_used_this_month sums in SQL. Summing rows client-side hit PostgREST's 1000-row
--    cap, because every AI call also writes a zero-credit `ai_call` row.
-- 4. profiles.last_matched_at lets the daily cron score the least-recently-matched users first.

create or replace function public.consume_credits(p_user_id uuid, p_action text, p_cost integer, p_allotment integer)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare v_used int;
begin
  if p_cost is null or p_cost <= 0 then
    raise exception 'p_cost must be positive' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':credits'));

  select coalesce(sum(credits), 0) into v_used
    from public.usage_events
    where user_id = p_user_id
      and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';

  if v_used + p_cost > p_allotment then return false; end if;

  insert into public.usage_events (user_id, action, credits) values (p_user_id, p_action, p_cost);
  return true;
end; $function$;

create or replace function public.credits_used_this_month(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(sum(credits), 0)::int
    from public.usage_events
    where user_id = p_user_id
      and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$function$;

revoke execute on function public.consume_credits(uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.credits_used_this_month(uuid) from public, anon, authenticated;
grant execute on function public.consume_credits(uuid, text, integer, integer) to service_role;
grant execute on function public.credits_used_this_month(uuid) to service_role;

alter table profiles add column if not exists last_matched_at timestamptz;
