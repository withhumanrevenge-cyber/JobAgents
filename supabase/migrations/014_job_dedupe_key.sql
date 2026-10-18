-- One job, many postings. Run AFTER 013. Idempotent.
--
-- The same role often appears several times: Adzuna lists it once per city or recruiter, and a
-- company can post it on its own board too. Each copy has its own source_id, so the pool kept
-- them all and every copy was scored separately (one account had a single "AI Engineer" role
-- six times). dedupe_key names the role (title + company) so the app can score it once, show it
-- once, and list every posting's link on the job page.
--
-- The key is computed here, by the database, so the backend and the frontend can't disagree on
-- what counts as a duplicate. Both parts are lower-cased with punctuation and spacing collapsed;
-- titles also lose requisition ids ("ID79855", "Req #123"), companies lose legal suffixes
-- (Inc, LLC, Pvt, Ltd, ...).

create or replace function public.job_dedupe_title(t text)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $$
  select trim(regexp_replace(
           regexp_replace(lower(coalesce(t, '')), '\m(id|req|ref|job)\s*#?\s*[0-9]+\M', ' ', 'g'),
           '[^a-z0-9+#]+', ' ', 'g'))
$$;

create or replace function public.job_dedupe_company(c text)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $$
  select trim(regexp_replace(
           regexp_replace(lower(coalesce(c, '')),
             '\m(inc|llc|llp|ltd|limited|pvt|private|corp|corporation|co|gmbh|plc)\M', ' ', 'g'),
           '[^a-z0-9+#]+', ' ', 'g'))
$$;

-- Stored generated column: filled for every existing row when added, and kept current on every
-- insert or update, with no backfill script.
alter table jobs add column if not exists dedupe_key text
  generated always as (public.job_dedupe_title(title) || '|' || public.job_dedupe_company(company)) stored;

create index if not exists idx_jobs_dedupe_key on jobs(dedupe_key);
