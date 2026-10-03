-- Webhook idempotency table. Run in the Supabase SQL editor. Idempotent.
-- Stores processed webhook event IDs to prevent duplicate processing on retries.

create table if not exists webhook_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,           -- 'razorpay' | 'lemonsqueezy'
  event_id        text not null,           -- provider's unique event ID
  event_type      text not null,           -- e.g. 'subscription.activated'
  payload         jsonb not null,          -- full webhook payload for debugging
  processed_at    timestamptz not null default now(),
  unique(provider, event_id)
);

create index if not exists idx_webhook_events_provider on webhook_events(provider);

alter table webhook_events enable row level security;

-- No policies needed: service role bypasses RLS, clients never access this table directly.
-- Supabase advisor may flag "RLS Enabled No Policy" — this is expected.