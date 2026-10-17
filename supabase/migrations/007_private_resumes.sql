-- Makes the resumes bucket private. Run AFTER deploying the code that serves resumes via
-- signed URLs (/api/resume/url), otherwise existing "View PDF" links will 400 in the gap.
--
-- Resumes are PII. While the bucket was public, anyone holding an object URL could read that
-- file forever. Going private means objects are only reachable through short-lived signed URLs
-- minted server-side for the owning user.
--
-- The owner-scoped policies from 005_storage_security.sql still apply. The API mints signed
-- URLs with the service role, so it is unaffected by them.

-- Creates the bucket on a fresh project (nothing else does), and flips it private if it exists.
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do update set public = false;
