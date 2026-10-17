-- Bring-your-own AI key. Run in the Supabase SQL editor AFTER 010. Idempotent.
--
-- One row per user: their AI provider key, encrypted by the backend (Fernet, key in the
-- backend's BYOK_ENCRYPTION_KEY env var) before it reaches the database. The plaintext key is
-- never stored and never sent back to the browser; the UI shows only key_hint (last 4 chars).

create table if not exists user_ai_keys (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  provider            text not null,
  key_ciphertext      text not null,
  key_hint            text not null,
  fast_model          text,          -- job scoring, candidate scoring
  quality_model       text,          -- resume tailoring, cover letters, interview prep, parsing
  status              text not null default 'valid',
  last_error          text,
  use_own_key         boolean not null default true,   -- paid plans: own key vs hosted credits
  background_matching boolean not null default true,   -- daily matching on the user's key
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint user_ai_keys_provider_check check (provider in ('groq', 'gemini', 'openai', 'anthropic', 'openrouter')),
  constraint user_ai_keys_status_check check (status in ('valid', 'invalid'))
);

alter table user_ai_keys enable row level security;

-- DELIBERATELY NO POLICIES: browsers can't read or write this table at all, even their own
-- row. Only the backend (service role) touches it. Supabase's advisor will flag
-- "RLS Enabled No Policy"; that is expected here.

-- Usage rows for calls made on a user's own key are logged as 'byok_call' (tokens only, zero
-- credits), so admin totals can separate our AI cost from users' own.
