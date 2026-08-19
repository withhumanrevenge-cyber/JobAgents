-- Makes the resumes bucket private. Run AFTER deploying the code that serves resumes via
-- signed URLs (/api/resume/url), otherwise existing "View PDF" links will 400 in the gap.
--
-- Resumes are PII. While the bucket was public, anyone holding an object URL could read that
-- file forever. Going private means objects are only reachable through short-lived signed URLs
-- minted server-side for the owning user.
--
-- The owner-scoped policies from 005_storage_security.sql still apply. The API mints signed
-- URLs with the service role, so it is unaffected by them.

update storage.buckets set public = false where id = 'resumes';
