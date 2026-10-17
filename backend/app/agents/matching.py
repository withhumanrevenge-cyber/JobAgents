"""Scores unscored jobs from the shared pool against one user's resume."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.countries import COUNTRY_NAME
from app.db import first, get_db
from app.errors import ApiError
from app.plans import PLAN_CONFIG, effective_plan, sources_for
from app.services.ai import AIContext, get_ai
from app.services.llm import parse_json

log = logging.getLogger(__name__)

BATCH_LIMIT = 24
CONCURRENCY = 4
PER_SOURCE_POOL = 400
# A "run" is one click of Find jobs: the client loops /api/match until remaining hits 0. The
# plan's matchPerRun caps jobs scored within one run. Clamped so a client can't send an old
# timestamp to reset its budget.
MAX_RUN_AGE = timedelta(minutes=15)

SYSTEM_PROMPT = """You are a precise job-matching assistant. Score how well a candidate's resume matches a job description.
Return ONLY valid JSON, no markdown, no explanation outside the JSON:
{
  "score": <integer 0-100>,
  "reason": "<one clear sentence explaining the score>",
  "matched_skills": ["<skill that matches>", ...],
  "missing_skills": ["<skill required but absent>", ...]
}
Scoring guide: 0-49 = poor fit, 50-74 = partial fit, 75-100 = strong fit.
Base the score primarily on skills match, years of experience relevance, and role alignment."""


def _candidate_context(profile: dict[str, Any], resume: dict[str, Any] | None) -> str:
    targets = [t for t in (profile.get("target_roles") or []) if t]
    if targets:
        target_line = f"Roles the candidate is ACTIVELY searching for (prioritize these): {', '.join(targets)}"
    elif resume:
        target_line = f"Inferred target role from resume: {resume.get('target_role') or ''}"
    else:
        target_line = ""
    if not resume:
        return (
            f"{target_line}\nName: {profile.get('full_name') or 'Unknown'}\n"
            f"LinkedIn: {profile.get('linkedin_url') or 'Not provided'}\n"
            "No parsed resume, scoring based on limited profile info."
        )
    recent = " | ".join(f"{e.get('title')} at {e.get('company')}" for e in (resume.get("experience") or [])[:2])
    return (
        f"{target_line}\nYears of Experience: {resume.get('years_experience')}\n"
        f"Skills: {', '.join(resume.get('skills') or [])}\nSummary: {resume.get('summary') or ''}\n"
        f"Recent Roles: {recent}"
    )


async def score_job(ai: AIContext, job: dict[str, Any], profile: dict[str, Any],
                    resume: dict[str, Any] | None) -> dict[str, Any] | None:
    """The score, or None if the model's reply couldn't be used. None is not saved, so the job
    is retried on a later run instead of being stuck with a made-up score. A problem with the
    user's key (rejected, out of quota, wrong model) raises, so the user sees what to fix."""
    prompt = (
        f"JOB:\nTitle: {job['title']}\nCompany: {job['company']}\nLocation: {job.get('location') or 'Remote'}\n"
        f"Required Skills/Tags: {', '.join(job.get('tags') or [])}\nDescription:\n"
        f"{(job.get('description') or 'No description provided.')[:900]}\n\n"
        f"CANDIDATE:\n{_candidate_context(profile, resume)}"
    )
    # Per-minute token caps produce transient rate limits; one short back-off usually clears them.
    for attempt in range(2):
        try:
            reply = await ai.call(prompt, SYSTEM_PROMPT, fast=True)
            break
        except ApiError as e:
            if attempt == 0 and e.status in (429, 503):
                await asyncio.sleep(4)
                continue
            if e.extra.get("code"):
                raise
            log.warning("Scoring failed for job %s: %s", job["id"], e.message)
            return None

    parsed = parse_json(reply)
    if not isinstance(parsed, dict) or not isinstance(parsed.get("score"), (int, float)):
        log.warning("Unparseable score for job %s", job["id"])
        return None
    as_list = lambda v: [str(x) for x in v] if isinstance(v, list) else []  # noqa: E731
    return {
        "score": max(0, min(100, round(parsed["score"]))),
        "reason": parsed.get("reason") or "Match score computed.",
        "matched_skills": as_list(parsed.get("matched_skills")),
        "missing_skills": as_list(parsed.get("missing_skills")),
    }


async def _matched_job_ids(user_id: str) -> set[str]:
    # PostgREST caps responses at 1000 rows; heavy users have far more matches than that.
    db = await get_db()
    ids: set[str] = set()
    page = 1000
    offset = 0
    while True:
        res = await db.table("matches").select("job_id").eq("user_id", user_id).range(offset, offset + page - 1).execute()
        rows = res.data or []
        ids.update(r["job_id"] for r in rows)
        if len(rows) < page:
            return ids
        offset += page


async def _candidate_pool(sources: list[str], country_name: str | None) -> list[dict[str, Any]]:
    """Recent jobs, an equal share per source, interleaved so the per-call batch spreads across
    sources instead of exhausting high-volume Adzuna first."""
    db = await get_db()

    async def from_source(source: str) -> list[dict[str, Any]]:
        q = (
            db.table("jobs")
            .select("id, title, company, location, tags, description, posted_date, source, country")
            .eq("source", source)
            .order("posted_date", desc=True)
            .limit(PER_SOURCE_POOL)
        )
        if country_name:
            q = q.in_("country", [country_name, "Worldwide"])
        return (await q.execute()).data or []

    per_source = await asyncio.gather(*(from_source(s) for s in sources))
    interleaved = []
    for i in range(max((len(rows) for rows in per_source), default=0)):
        interleaved += [rows[i] for rows in per_source if i < len(rows)]
    return interleaved


async def _scored_since(user_id: str, since: datetime) -> int:
    db = await get_db()
    res = await (
        db.table("matches").select("id", count="exact")
        .eq("user_id", user_id).gte("match_score", 0).gte("created_at", since.isoformat())
        .limit(1).execute()
    )
    return res.count or 0


async def match_jobs_for_user(
    user_id: str, *, limit: int | None = None, run_started_at: datetime | None = None
) -> dict[str, Any]:
    db = await get_db()
    profile = await first(db.table("profiles").select("*").eq("user_id", user_id))
    if not profile:
        raise ApiError(404, "Profile not found.")

    resume = profile.get("parsed_resume")
    if not resume and not [t for t in (profile.get("target_roles") or []) if t]:
        raise ApiError(400, "Upload your resume (or set target roles in Settings) so the AI can score jobs against you.")

    now = datetime.now(timezone.utc)
    run_start = max(run_started_at or now, now - MAX_RUN_AGE)
    plan = effective_plan(profile)
    ai = await get_ai(user_id, profile)
    cfg = PLAN_CONFIG[plan]
    if ai.mode == "trial":
        # Free without a key runs on our key: a small run, and a daily ceiling.
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        budget = min(cfg["trialMatchPerRun"] - await _scored_since(user_id, run_start),
                     cfg["trialMatchPerDay"] - await _scored_since(user_id, day_start))
    else:
        budget = cfg["matchPerRun"] - await _scored_since(user_id, run_start)
    if budget <= 0:
        return {"matched": 0, "skipped": 0, "failed": 0, "remaining": 0, "limited": ai.mode == "trial"}

    country_name = COUNTRY_NAME.get((profile.get("target_country") or "").upper())
    pool = await _candidate_pool(sources_for(plan), country_name)
    matched_ids = await _matched_job_ids(user_id)
    unmatched = [j for j in pool if j["id"] not in matched_ids]

    batch = unmatched[: min(limit or BATCH_LIMIT, budget)]
    threshold = profile.get("match_threshold")
    threshold = 70 if threshold is None else threshold
    counts = {"matched": 0, "skipped": 0, "failed": 0}

    async def score_and_save(job: dict[str, Any]) -> None:
        result = await score_job(ai, job, profile, resume)
        if result is None:
            counts["failed"] += 1
            return
        passed = result["score"] >= threshold
        try:
            # ignore_duplicates: a concurrent run (or the cron) may have scored it meanwhile.
            await db.table("matches").upsert({
                "user_id": user_id,
                "job_id": job["id"],
                "match_score": result["score"],
                "match_reason": result["reason"],
                "matched_skills": result["matched_skills"],
                "missing_skills": result["missing_skills"],
                "status": "reviewed" if passed else "skipped",
            }, on_conflict="user_id,job_id", ignore_duplicates=True).execute()
        except Exception:
            log.exception("Failed to save match for job %s", job["id"])
            counts["failed"] += 1
            return
        counts["matched" if passed else "skipped"] += 1

    for i in range(0, len(batch), CONCURRENCY):
        await asyncio.gather(*(score_and_save(j) for j in batch[i : i + CONCURRENCY]))

    await db.table("profiles").update({"last_matched_at": now.isoformat()}).eq("user_id", user_id).execute()

    saved = counts["matched"] + counts["skipped"]
    remaining = max(0, min(len(unmatched) - saved, budget - saved))
    return {**counts, "remaining": remaining, "limited": ai.mode == "trial" and budget - saved <= 0}
