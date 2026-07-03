-- Recruiter/employer side. Run in the Supabase SQL editor. Idempotent.

-- Distinguish seekers from recruiters, and let seekers opt into the talent pool.
alter table profiles add column if not exists account_type text not null default 'seeker';
alter table profiles add column if not exists open_to_work boolean not null default false;
alter table profiles add column if not exists company_name text;

-- Roles posted by recruiters.
create table if not exists job_postings (
  id               uuid primary key default gen_random_uuid(),
  recruiter_id     uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  company          text not null,
  location         text,
  job_type         text not null default 'onsite',
  experience_level text not null default 'mid',
  description      text not null,
  skills           text[] not null default '{}',
  salary_range     text,
  status           text not null default 'open',
  created_at       timestamptz not null default now()
);

-- AI-scored candidates per posting (drawn from the opt-in talent pool).
create table if not exists candidate_matches (
  id             uuid primary key default gen_random_uuid(),
  posting_id     uuid not null references job_postings(id) on delete cascade,
  candidate_id   uuid not null references auth.users(id) on delete cascade,
  match_score    int not null check (match_score between 0 and 100),
  match_reason   text,
  matched_skills text[] not null default '{}',
  missing_skills text[] not null default '{}',
  status         text not null default 'new',
  created_at     timestamptz not null default now(),
  unique(posting_id, candidate_id)
);

create index if not exists idx_job_postings_recruiter on job_postings(recruiter_id);
create index if not exists idx_candidate_matches_posting on candidate_matches(posting_id);

alter table job_postings enable row level security;
alter table candidate_matches enable row level security;

drop policy if exists "postings_own" on job_postings;
create policy "postings_own" on job_postings for all
  using (auth.uid() = recruiter_id) with check (auth.uid() = recruiter_id);

drop policy if exists "candidate_matches_own" on candidate_matches;
create policy "candidate_matches_own" on candidate_matches for all
  using (exists (select 1 from job_postings p where p.id = posting_id and p.recruiter_id = auth.uid()));
