-- Base schema. Run this first, then every file in supabase/migrations/ in numeric order
-- (002 → 011). Every statement is idempotent, so the whole sequence is safe to run against
-- both a fresh project and the live database.

-- PROFILES (one per user)
create table if not exists profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade unique,
  full_name         text,
  email             text,
  phone             text,
  github_username   text,
  linkedin_url      text,
  base_resume_url   text,
  match_threshold   int not null default 70 check (match_threshold between 0 and 100),
  auto_apply        boolean not null default false,
  onboarded         boolean not null default false,
  parsed_resume     jsonb,
  resume_parsed_at  timestamptz,
  target_roles      text[] not null default '{}',
  target_country    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- JOBS (shared pool, deduplicated by source_id)
create table if not exists jobs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  company      text not null,
  location     text,
  remote       boolean not null default true,
  url          text not null,
  description  text,
  salary_range text,
  tags         text[],
  posted_date  timestamptz,
  source       text not null,
  source_id    text not null,
  created_at   timestamptz not null default now(),
  unique(source, source_id)
);

-- MATCHES (per user, per job)
create table if not exists matches (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  job_id              uuid not null references jobs(id) on delete cascade,
  match_score         int not null check (match_score between -1 and 100),
  match_reason        text,
  matched_skills      text[],
  missing_skills      text[],
  status              text not null default 'pending'
                        check (status in ('pending','reviewed','applied','skipped','interview','rejected','offer')),
  tailored_resume_url text,
  tailored_resume_json jsonb,
  applied_at          timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  unique(user_id, job_id)
);

-- GITHUB CACHE (reduce API calls, 6-hour TTL)
create table if not exists github_cache (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade unique,
  github_username text not null,
  repos           jsonb not null default '[]',
  languages       jsonb not null default '{}',
  bio             text,
  fetched_at      timestamptz not null default now()
);

-- INDEXES
-- matches(user_id) is already covered by unique(user_id, job_id), so it gets no separate index.
-- matches(job_id) needs one: it's a FK, and deleting a job cascades through it.
create index if not exists idx_matches_job_id on matches(job_id);
create index if not exists idx_matches_status on matches(status);
create index if not exists idx_jobs_source on jobs(source);
create index if not exists idx_jobs_posted_date on jobs(posted_date desc);

-- ROW LEVEL SECURITY
alter table profiles enable row level security;
alter table matches enable row level security;
alter table github_cache enable row level security;
alter table jobs enable row level security;

-- (select auth.uid()) is evaluated once per query instead of once per row.
-- Billing/admin columns on profiles are additionally guarded by a trigger (migration 009).
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

-- UPDATED_AT trigger
create or replace function public.update_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles
  for each row execute procedure public.update_updated_at();

-- STORAGE — see supabase/migrations/005_storage_security.sql and 007_private_resumes.sql.
-- Never add a broad SELECT policy on the resumes bucket: it lets clients list every user's
-- resume. Policies are scoped to the owner's folder.
