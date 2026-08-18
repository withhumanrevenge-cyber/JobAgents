-- Documents the usage_events ledger, which was originally created ad-hoc in the SQL editor
-- and was missing from source control. Idempotent — safe to run against the live DB.

create table if not exists usage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null,
  credits    int  not null default 0,
  tokens     int  not null default 0,
  model      text,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_events_user_month on usage_events(user_id, created_at desc);

alter table usage_events enable row level security;

-- DELIBERATELY NO POLICIES. RLS on + zero policies = every anon/authenticated client is denied,
-- while the service role (which bypasses RLS) still has full access. Every read and write goes
-- through server-side code using createServiceClient(), so clients never need direct access.
-- Supabase's advisor flags this as "RLS Enabled No Policy" — that is expected here, not a bug.
-- Do NOT add a policy to silence the warning; it would only widen access to a billing ledger.
