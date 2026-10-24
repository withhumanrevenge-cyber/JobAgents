-- Proof of Fit. Run in the Supabase SQL editor AFTER 011. Idempotent.
--
-- A seeker answers a short, timed, role-specific work sample (3 questions, each with a
-- follow-up generated from their own answer). The AI grades each skill with quotes from the
-- answers as evidence. Recruiters who invite a candidate must decide (advance or decline)
-- within the posting's response window; past it, the candidate is declined automatically with
-- feedback, and the miss counts against the recruiter's response rate. Contact details are
-- shared only after the recruiter advances AND the candidate accepts.

create table if not exists skill_proofs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  posting_id    uuid references job_postings(id) on delete set null,
  job_id        uuid references jobs(id) on delete set null,
  role_title    text not null,
  skills        text[] not null default '{}',
  status        text not null default 'in_progress',
  -- Every question asked and answered, in order. A proof is always read whole, so the steps
  -- live with it: [{kind, skill, question, asked_at, answer, answered_at, seconds, pasted, late}]
  steps         jsonb not null default '[]',
  score         int,
  report        jsonb,
  is_public     boolean not null default false,
  public_slug   text unique,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint skill_proofs_status_check check (status in ('in_progress', 'completed', 'abandoned')),
  constraint skill_proofs_score_check check (score is null or score between 0 and 100)
);

create index if not exists idx_skill_proofs_user on skill_proofs(user_id, created_at desc);
create index if not exists idx_skill_proofs_posting on skill_proofs(posting_id);
create index if not exists idx_skill_proofs_job on skill_proofs(job_id);

alter table skill_proofs enable row level security;

-- Seekers may read their own proofs. All writes go through the backend, which enforces the
-- timing and grading; browsers can't write proofs at all.
drop policy if exists "skill_proofs_read_own" on skill_proofs;
create policy "skill_proofs_read_own" on skill_proofs for select to authenticated
  using ((select auth.uid()) = user_id);

-- Invitations, decisions and introductions on the recruiter's candidate list.
alter table candidate_matches add column if not exists invited_at         timestamptz;
alter table candidate_matches add column if not exists proof_id           uuid references skill_proofs(id) on delete set null;
alter table candidate_matches add column if not exists decision           text not null default 'pending';
alter table candidate_matches add column if not exists decision_due_at    timestamptz;
alter table candidate_matches add column if not exists decided_at         timestamptz;
alter table candidate_matches add column if not exists decided_by         text;
alter table candidate_matches add column if not exists feedback           text;
alter table candidate_matches add column if not exists candidate_response text;

do $$ begin
  alter table candidate_matches add constraint candidate_matches_decision_check
    check (decision in ('pending', 'advanced', 'declined'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table candidate_matches add constraint candidate_matches_decided_by_check
    check (decided_by is null or decided_by in ('recruiter', 'timeout'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table candidate_matches add constraint candidate_matches_response_check
    check (candidate_response is null or candidate_response in ('accepted', 'declined'));
exception when duplicate_object then null; end $$;

create index if not exists idx_candidate_matches_proof on candidate_matches(proof_id);
-- The daily sync looks for overdue decisions.
create index if not exists idx_candidate_matches_due on candidate_matches(decision_due_at)
  where decision = 'pending' and decision_due_at is not null;

-- Days a recruiter has to decide once a candidate finishes their proof.
alter table job_postings add column if not exists response_sla_days int not null default 7;
do $$ begin
  alter table job_postings add constraint job_postings_response_sla_check
    check (response_sla_days between 1 and 30);
exception when duplicate_object then null; end $$;

-- Recruiters could previously write candidate_matches from the browser. Decisions now carry a
-- deadline and notify the candidate, so only the backend writes; recruiters keep read access.
drop policy if exists "candidate_matches_own" on candidate_matches;
drop policy if exists "candidate_matches_recruiter_read" on candidate_matches;
create policy "candidate_matches_recruiter_read" on candidate_matches for select to authenticated
  using (exists (select 1 from job_postings p where p.id = posting_id and p.recruiter_id = (select auth.uid())));
