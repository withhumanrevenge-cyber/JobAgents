-- Funnel and Proof of Fit metrics for the admin dashboard. Run AFTER 012. Idempotent.
--
-- One cohort: seekers who signed up in the last p_days. Every step counts people from that
-- cohort only, so the steps can be compared (paying users included).
-- "Used an AI tool" reads the saved outputs on matches, not usage_events: calls on a user's
-- own key spend no credits, and counting credit rows would miss them.
-- The headline is interview_rate: of the cohort who applied anywhere, the share who marked at
-- least one application as reaching interview. It's split by whether they finished a Proof
-- of Fit, which is the comparison that shows whether proofs work.

create or replace function public.admin_funnel(p_days integer default 90)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with cohort as (
    select user_id, parsed_resume is not null as has_resume, plan, plan_expires_at
    from public.profiles
    where account_type = 'seeker' and created_at >= now() - make_interval(days => p_days)
  ),
  m as (
    select mt.user_id,
           bool_or(mt.match_score >= 0) as scored,
           bool_or(mt.tailored_resume_json is not null or mt.cover_letter is not null
                   or mt.interview_questions is not null) as used_ai,
           bool_or(mt.status in ('applied', 'interview', 'offer', 'rejected')) as applied,
           bool_or(mt.status in ('interview', 'offer')) as interview,
           bool_or(mt.status = 'offer') as offer
    from public.matches mt join cohort c using (user_id)
    group by mt.user_id
  ),
  p as (
    select distinct sp.user_id from public.skill_proofs sp join cohort c using (user_id)
    where sp.status = 'completed'
  ),
  per_user as (
    select c.user_id, c.has_resume,
           coalesce(m.scored, false) as scored, coalesce(m.used_ai, false) as used_ai,
           coalesce(m.applied, false) as applied, coalesce(m.interview, false) as interview,
           coalesce(m.offer, false) as offer, p.user_id is not null as proved,
           c.plan in ('pro', 'premium', 'lifetime') and (c.plan_expires_at is null or c.plan_expires_at > now()) as paying
    from cohort c left join m using (user_id) left join p using (user_id)
  ),
  proofs as (
    select count(*) filter (where created_at >= now() - make_interval(days => p_days)) as started,
           count(*) filter (where status = 'completed' and created_at >= now() - make_interval(days => p_days)) as completed
    from public.skill_proofs
  ),
  decisions as (
    select count(*) filter (where invited_at >= now() - make_interval(days => p_days)) as invited,
           count(*) filter (where decided_by = 'recruiter' and decided_at >= now() - make_interval(days => p_days)) as on_time,
           count(*) filter (where decided_by = 'timeout' and decided_at >= now() - make_interval(days => p_days)) as timed_out,
           count(*) filter (where candidate_response = 'accepted' and decided_at >= now() - make_interval(days => p_days)) as intros
    from public.candidate_matches
  )
  select jsonb_build_object(
    'days', p_days,
    'funnel', jsonb_build_object(
      'signed_up', count(*),
      'uploaded_resume', count(*) filter (where has_resume),
      'got_scored_jobs', count(*) filter (where scored),
      'used_ai_tool', count(*) filter (where used_ai),
      'finished_proof', count(*) filter (where proved),
      'applied', count(*) filter (where applied),
      'reached_interview', count(*) filter (where interview),
      'got_offer', count(*) filter (where offer),
      'paying', count(*) filter (where paying)
    ),
    'interview_rate', jsonb_build_object(
      'all', round(100.0 * count(*) filter (where interview) / nullif(count(*) filter (where applied), 0), 1),
      'with_proof', round(100.0 * count(*) filter (where interview and proved) / nullif(count(*) filter (where applied and proved), 0), 1),
      'without_proof', round(100.0 * count(*) filter (where interview and not proved) / nullif(count(*) filter (where applied and not proved), 0), 1),
      'applied_with_proof', count(*) filter (where applied and proved),
      'applied_without_proof', count(*) filter (where applied and not proved)
    ),
    'proofs', (select jsonb_build_object('started', started, 'completed', completed) from proofs),
    'decisions', (select jsonb_build_object('invited', invited, 'on_time', on_time, 'timed_out', timed_out, 'intros_accepted', intros) from decisions)
  )
  from per_user;
$function$;

revoke execute on function public.admin_funnel(integer) from public, anon, authenticated;
grant execute on function public.admin_funnel(integer) to service_role;
