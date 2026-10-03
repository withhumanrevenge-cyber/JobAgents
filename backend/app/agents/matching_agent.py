# backend/app/agents/matching_agent.py
import logging
from typing import List, Dict, Any, Optional, Set
from app.services.groq_service import groq_service
from app.services.supabase_service import supabase_service
from app.core.config import settings
from app.schemas.common import Plan

logger = logging.getLogger(__name__)

BATCH_LIMIT = 24
CONCURRENCY = 4

PLAN_CONFIG = {
    "free": {"credits": 15, "match_per_run": 50, "max_visible_matches": 25, "all_sources": False, "all_countries": False},
    "pro": {"credits": 100, "match_per_run": 150, "max_visible_matches": 150, "all_sources": True, "all_countries": True},
    "premium": {"credits": 300, "match_per_run": 300, "max_visible_matches": 2000, "all_sources": True, "all_countries": True},
}

COUNTRY_ISO_TO_NAME = {
    "US": "United States", "GB": "United Kingdom", "CA": "Canada", "DE": "Germany",
    "FR": "France", "IN": "India", "AU": "Australia", "NL": "Netherlands",
    "SG": "Singapore", "AE": "United Arab Emirates", "ZA": "South Africa",
    "NZ": "New Zealand", "PL": "Poland", "IE": "Ireland", "ES": "Spain",
    "IT": "Italy", "MX": "Mexico", "BR": "Brazil", "CH": "Switzerland",
}


async def score_job(
    job: Dict[str, Any],
    profile: Dict[str, Any],
    parsed_resume: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    system_prompt = """You are a precise job-matching assistant. Score how well a candidate's resume matches a job description.
Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "score": <integer 0-100>,
  "reason": "<one clear sentence explaining the score>",
  "matched_skills": ["<skill that matches>", ...],
  "missing_skills": ["<skill required but absent>", ...]
}
Scoring guide: 0-49 = poor fit, 50-74 = partial fit, 75-100 = strong fit.
Base the score primarily on skills match, years of experience relevance, and role alignment."""

    stated_targets = [t for t in (profile.get("target_roles") or []) if t]
    target_line = ""
    if stated_targets:
        target_line = f"Roles the candidate is ACTIVELY searching for (prioritize these): {', '.join(stated_targets)}"
    elif parsed_resume and parsed_resume.get("target_role"):
        target_line = f"Inferred target role from resume: {parsed_resume['target_role']}"

    if parsed_resume:
        candidate_context = f"""{target_line}
Years of Experience: {parsed_resume.get('years_experience', 0)}
Skills: {', '.join(parsed_resume.get('skills', []))}
Summary: {parsed_resume.get('summary', '')}
Recent Roles: {' | '.join(f"{e.get('title', '')} at {e.get('company', '')}" for e in parsed_resume.get('experience', [])[:2])}"""
    else:
        candidate_context = f"""{target_line}
Name: {profile.get('full_name', 'Unknown')}
LinkedIn: {profile.get('linkedin_url', 'Not provided')}
No parsed resume — scoring based on limited profile info."""

    user_prompt = f"""JOB:
Title: {job.get('title', '')}
Company: {job.get('company', '')}
Location: {job.get('location', 'Remote')}
Required Skills/Tags: {', '.join(job.get('tags', []))}
Description:
{(job.get('description') or 'No description provided.')[:900]}

CANDIDATE:
{candidate_context}"""

    # Retry once on rate limit
    response = ""
    for attempt in range(2):
        try:
            response = await groq_service.call(
                user_prompt,
                system_prompt,
                model=settings.GROQ_FAST_MODEL,
                max_tokens=700,
                meterUserId=profile.get("user_id")
            )
            break
        except Exception as e:
            if attempt == 0 and ("rate" in str(e).lower() or "429" in str(e) or "quota" in str(e).lower()):
                import asyncio
                await asyncio.sleep(4)
                continue
            raise

    parsed = groq_service.parse_json(response)
    if parsed and isinstance(parsed.get("score"), (int, float)):
        return {
            "score": max(0, min(100, int(round(parsed["score"])))),
            "reason": parsed.get("reason", "Match score computed."),
            "matched_skills": parsed.get("matched_skills", []) if isinstance(parsed.get("matched_skills"), list) else [],
            "missing_skills": parsed.get("missing_skills", []) if isinstance(parsed.get("missing_skills"), list) else [],
        }

    return {
        "score": 50,
        "reason": "Could not parse AI response — defaulting to 50.",
        "matched_skills": [],
        "missing_skills": [],
    }


async def match_jobs_for_user(
    user_id: str,
    limit: Optional[int] = None
) -> Dict[str, int]:
    profile = await supabase_service.get_profile(user_id)
    if not profile:
        raise ValueError(f"Profile not found for user: {user_id}")

    parsed_resume = profile.get("parsed_resume")
    target_roles = [t for t in (profile.get("target_roles") or []) if t]
    
    if not parsed_resume and not target_roles:
        raise ValueError("Upload your resume (or set target roles in Settings) so the AI can score jobs against you.")

    # Get already matched job IDs
    matched_job_ids = await supabase_service.get_matched_job_ids(user_id)

    # Determine sources and country based on plan
    plan = profile.get("plan", "free")
    if plan not in PLAN_CONFIG:
        plan = "free"
    plan_cfg = PLAN_CONFIG[plan]
    sources = ["adzuna", "greenhouse", "lever", "ashby"] if plan_cfg["all_sources"] else ["adzuna"]
    target_country = profile.get("target_country")
    target_country_name = COUNTRY_ISO_TO_NAME.get(target_country.upper()) if target_country else None

    # Fetch fair-share pool from each source
    PER_SOURCE_POOL = 400
    jobs = await supabase_service.get_jobs_for_matching(sources, target_country_name, PER_SOURCE_POOL)

    if not jobs:
        return {"matched": 0, "skipped": 0, "remaining": 0}

    # Interleave sources
    by_source = {}
    for job in jobs:
        src = job.get("source", "unknown")
        if src not in by_source:
            by_source[src] = []
        by_source[src].append(job)

    interleaved = []
    max_len = max(len(v) for v in by_source.values()) if by_source else 0
    for i in range(max_len):
        for src in sources:
            if src in by_source and i < len(by_source[src]):
                interleaved.append(by_source[src][i])

    # Filter unmatched
    unmatched = [j for j in interleaved if j["id"] not in matched_job_ids]
    if not unmatched:
        return {"matched": 0, "skipped": 0, "remaining": 0}

    per_run_cap = plan_cfg["match_per_run"]
    eligible = unmatched[:per_run_cap]
    batch_size = min(limit or BATCH_LIMIT, len(eligible))
    batch = eligible[:batch_size]
    remaining = len(eligible) - batch_size

    matched_count = 0
    skipped_count = 0

    import asyncio

    async def score_one(job: Dict[str, Any]):
        nonlocal matched_count, skipped_count
        try:
            result = await score_job(job, profile, parsed_resume)
        except Exception as e:
            logger.warning(f"Groq scoring failed for job {job['id']}: {e}")
            return

        passed = result["score"] >= profile.get("match_threshold", 70)
        status = "reviewed" if passed else "skipped"

        match_data = {
            "user_id": user_id,
            "job_id": job["id"],
            "match_score": result["score"],
            "match_reason": result["reason"],
            "matched_skills": result["matched_skills"],
            "missing_skills": result["missing_skills"],
            "status": status,
            "applied_at": None,
        }

        success = await supabase_service.upsert_match(match_data)
        if success:
            if passed:
                matched_count += 1
            else:
                skipped_count += 1

    # Process in concurrent batches
    for i in range(0, len(batch), CONCURRENCY):
        chunk = batch[i:i + CONCURRENCY]
        await asyncio.gather(*[score_one(job) for job in chunk])

    return {"matched": matched_count, "skipped": skipped_count, "remaining": remaining}