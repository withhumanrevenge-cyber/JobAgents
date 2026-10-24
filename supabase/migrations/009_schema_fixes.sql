-- Brings the schema in line with what the app and backend actually read and write, and closes
-- a privilege-escalation hole on profiles. Run in the Supabase SQL editor. Idempotent.
--
-- 1. Columns the code uses that no earlier migration created (they were added by hand on the
--    live DB, so a fresh project failed with "column does not exist").
-- 2. A trigger so users can't grant themselves a paid plan / admin flag. profiles_own lets a
--    user update their own row, and the browser writes profiles directly, so without this
--    `supabase.from("profiles").update({ plan: "premium" })` from devtools worked.
-- 3. CHECK constraints on the enum-like text columns (values mirror types/index.ts).
-- 4. Index fixes: FK indexes for cascades, drop indexes duplicated by unique constraints.
-- 5. RLS policies for the hiring tables: per-query auth.uid(), scoped to authenticated.


-- 1. MISSING COLUMNS --------------------------------------------------------------------------

-- profiles: notifications, billing, admin
alter table profiles add column if not exists email_notifications     boolean not null default true;
alter table profiles add column if not exists plan                    text    not null default 'free';
alter table profiles add column if not exists plan_expires_at         timestamptz;
alter table profiles add column if not exists is_admin                boolean not null default false;
alter table profiles add column if not exists billing_provider        text;
alter table profiles add column if not exists billing_customer_id     text;
alter table profiles add column if not exists billing_subscription_id text;

-- jobs: location + classification written by the fetchers/scrapers
alter table jobs add column if not exists country          text;
alter table jobs add column if not exists region           text;
alter table jobs add column if not exists job_type         text not null default 'unknown';
alter table jobs add column if not exists experience_level text not null default 'unknown';

-- matches: generated interview prep and cover letters
alter table matches add column if not exists interview_questions       jsonb;
alter table matches add column if not exists interview_generated_at    timestamptz;
alter table matches add column if not exists cover_letter              text;
alter table matches add column if not exists cover_letter_generated_at timestamptz;


-- 2. PROTECT BILLING / ADMIN COLUMNS ----------------------------------------------------------
-- Requests from the browser run as `authenticated` (or `anon`). The service role (webhooks,
-- admin API, backend) and the SQL editor (`postgres`) are allowed through unchanged.
-- Unchanged values pass, so a client that echoes the current plan back doesn't break.

create or replace function public.protect_profile_billing()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan <> 'free'
       or new.is_admin
       or new.plan_expires_at is not null
       or new.billing_provider is not null
       or new.billing_customer_id is not null
       or new.billing_subscription_id is not null then
      raise exception 'billing and admin fields can only be set by the server'
        using errcode = '42501';
    end if;
  elsif new.plan                    is distinct from old.plan
     or new.plan_expires_at         is distinct from old.plan_expires_at
     or new.is_admin                is distinct from old.is_admin
     or new.billing_provider        is distinct from old.billing_provider
     or new.billing_customer_id     is distinct from old.billing_customer_id
     or new.billing_subscription_id is distinct from old.billing_subscription_id then
    raise exception 'billing and admin fields can only be changed by the server'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_billing on profiles;
create trigger profiles_protect_billing before insert or update on profiles
  for each row execute procedure public.protect_profile_billing();


-- 3. CHECK CONSTRAINTS ------------------------------------------------------------------------
-- Each constraint is added NOT VALID (enforced on every new write), then validated against the
-- existing rows. If old rows don't fit, you get a WARNING naming the constraint instead of the
-- whole migration failing — fix those rows, then run the `validate constraint` it prints.

create or replace function pg_temp.add_check(tbl text, con text, expr text)
returns void language plpgsql as $$
begin
  execute format('alter table %I drop constraint if exists %I', tbl, con);
  execute format('alter table %I add constraint %I check (%s) not valid', tbl, con, expr);
  begin
    execute format('alter table %I validate constraint %I', tbl, con);
  exception when check_violation then
    raise warning '% has rows violating %. Left NOT VALID; fix them, then run: alter table % validate constraint %;',
      tbl, con, tbl, con;
  end;
end;
$$;

-- 'lifetime' is a legacy value that lib/plans.ts effectivePlan() still maps to premium.
select pg_temp.add_check('profiles', 'profiles_plan_check',
  $c$plan in ('free', 'pro', 'premium', 'lifetime')$c$);
select pg_temp.add_check('profiles', 'profiles_account_type_check',
  $c$account_type in ('seeker', 'recruiter')$c$);
select pg_temp.add_check('profiles', 'profiles_billing_provider_check',
  $c$billing_provider in ('razorpay', 'lemonsqueezy')$c$);

select pg_temp.add_check('jobs', 'jobs_job_type_check',
  $c$job_type in ('remote', 'hybrid', 'onsite', 'unknown')$c$);
select pg_temp.add_check('jobs', 'jobs_experience_level_check',
  $c$experience_level in ('entry', 'mid', 'senior', 'lead', 'unknown')$c$);

select pg_temp.add_check('job_postings', 'job_postings_job_type_check',
  $c$job_type in ('remote', 'hybrid', 'onsite', 'unknown')$c$);
select pg_temp.add_check('job_postings', 'job_postings_experience_level_check',
  $c$experience_level in ('entry', 'mid', 'senior', 'lead', 'unknown')$c$);
select pg_temp.add_check('job_postings', 'job_postings_status_check',
  $c$status in ('open', 'closed')$c$);

select pg_temp.add_check('candidate_matches', 'candidate_matches_status_check',
  $c$status in ('new', 'shortlisted', 'contacted', 'rejected')$c$);

select pg_temp.add_check('webhook_events', 'webhook_events_provider_check',
  $c$provider in ('razorpay', 'lemonsqueezy')$c$);


-- 4. INDEXES ----------------------------------------------------------------------------------

-- FK columns with on delete cascade: without these, every delete scans the child table.
create index if not exists idx_matches_job_id on matches(job_id);
create index if not exists idx_candidate_matches_candidate on candidate_matches(candidate_id);

-- revokeBySubscription() looks profiles up by subscription id on every cancel webhook.
create index if not exists idx_profiles_billing_subscription on profiles(billing_subscription_id)
  where billing_subscription_id is not null;

-- Already covered by the leading column of a unique constraint.
drop index if exists idx_matches_user_id;              -- unique(user_id, job_id)
drop index if exists idx_candidate_matches_posting;    -- unique(posting_id, candidate_id)
drop index if exists idx_webhook_events_provider;      -- unique(provider, event_id)


-- 5. FUNCTION + RLS HARDENING -----------------------------------------------------------------

-- Pin search_path (Supabase advisor: function_search_path_mutable). Same body as schema.sql.
create or replace function public.update_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

-- Base-table policies (same as schema.sql — repeated so the live DB picks them up).
drop policy if exists "profiles_own" on profiles;
create policy "profiles_own" on profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "matches_own" on matches;
create policy "matches_own" on matches for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "github_cache_own" on github_cache;
create policy "github_cache_own" on github_cache for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "jobs_read" on jobs;
create policy "jobs_read" on jobs for select to authenticated using (true);

-- Hiring tables (from 003).
drop policy if exists "postings_own" on job_postings;
create policy "postings_own" on job_postings for all to authenticated
  using ((select auth.uid()) = recruiter_id) with check ((select auth.uid()) = recruiter_id);

drop policy if exists "candidate_matches_own" on candidate_matches;
create policy "candidate_matches_own" on candidate_matches for all to authenticated
  using (exists (
    select 1 from job_postings p
    where p.id = candidate_matches.posting_id and p.recruiter_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from job_postings p
    where p.id = candidate_matches.posting_id and p.recruiter_id = (select auth.uid())
  ));
