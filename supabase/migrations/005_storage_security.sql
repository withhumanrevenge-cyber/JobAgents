-- Locks down the `resumes` bucket. Run in the Supabase SQL editor. Idempotent.
--
-- Problem: broad SELECT policies on storage.objects let ANY client list every file in the
-- bucket. Since paths are `<user_id>/resume_<ts>.pdf`, listing hands out a complete index of
-- every user's resume, which is PII. Public buckets do NOT need a SELECT policy for
-- getPublicUrl() links to work, so removing these breaks nothing.
--
-- Also scopes writes to the uploader's own folder — previously any authenticated user could
-- upsert over another user's resume.

drop policy if exists "Allow public read access" on storage.objects;
drop policy if exists "resumes_public_read" on storage.objects;
drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow authenticated updates" on storage.objects;
drop policy if exists "resumes_auth_insert" on storage.objects;
drop policy if exists "resumes_auth_update" on storage.objects;

create policy "resumes_own_read" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
