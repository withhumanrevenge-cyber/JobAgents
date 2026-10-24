-- Onboarding columns the app writes on profile save (app/onboarding/page.tsx handleFinish,
-- signup, and the auth callback). The original profiles table predates these, so the upsert
-- fails with an "unknown column" error that the UI surfaced as a generic "Failed to save."
-- Run this in the Supabase SQL editor.
-- All statements are idempotent (add column if not exists) — safe to re-run.

alter table profiles add column if not exists email            text;
alter table profiles add column if not exists phone            text;
alter table profiles add column if not exists onboarded        boolean not null default false;
alter table profiles add column if not exists parsed_resume    jsonb;
alter table profiles add column if not exists resume_parsed_at timestamptz;
alter table profiles add column if not exists target_roles     text[]  not null default '{}';
alter table profiles add column if not exists target_country   text;
