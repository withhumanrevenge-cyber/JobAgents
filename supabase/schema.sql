-- PROFILES (one per user)
create table profiles (
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
create table jobs (
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
create table matches (
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
create table github_cache (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade unique,
  github_username text not null,
  repos           jsonb not null default '[]',
  languages       jsonb not null default '{}',
  bio             text,
  fetched_at      timestamptz not null default now()
);

-- INDEXES
create index idx_matches_user_id on matches(user_id);
create index idx_matches_status on matches(status);
create index idx_jobs_source on jobs(source);
create index idx_jobs_posted_date on jobs(posted_date desc);

-- ROW LEVEL SECURITY
alter table profiles enable row level security;
alter table matches enable row level security;
alter table github_cache enable row level security;
alter table jobs enable row level security;

create policy "profiles_own" on profiles for all using (auth.uid() = user_id);
create policy "matches_own" on matches for all using (auth.uid() = user_id);
create policy "github_cache_own" on github_cache for all using (auth.uid() = user_id);
create policy "jobs_read" on jobs for select using (auth.role() = 'authenticated');

-- UPDATED_AT trigger
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on profiles
  for each row execute procedure update_updated_at();

-- STORAGE (run these in Supabase dashboard under Storage > Policies)
-- create policy "Allow public read access" on storage.objects for select using (bucket_id = 'resumes');
-- create policy "Allow authenticated uploads" on storage.objects for insert to authenticated with check (bucket_id = 'resumes');
-- create policy "Allow authenticated updates" on storage.objects for update to authenticated using (bucket_id = 'resumes');

-- ADD COLUMNS TO EXISTING PROFILES TABLE (run this if table already exists)
-- alter table profiles add column if not exists email text;
-- alter table profiles add column if not exists phone text;
-- alter table profiles add column if not exists onboarded boolean not null default false;
-- alter table profiles add column if not exists parsed_resume jsonb;
-- alter table profiles add column if not exists resume_parsed_at timestamptz;
-- alter table profiles add column if not exists target_roles text[] not null default '{}';
-- alter table profiles add column if not exists target_country text;
-- See supabase/migrations/002_onboarding_columns.sql for the runnable version.
