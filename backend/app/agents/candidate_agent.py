# backend/app/agents/candidate_agent.py
import logging
from typing import Dict, Any, List, Set
from app.services.groq_service import groq_service
from app.services.supabase_service import supabase_service
from app.core.config import settings

logger = logging.getLogger(__name__)


async def score_candidate(posting: Dict[str, Any], candidate: Dict[str, Any]) -> Dict[str, Any]:
    system_prompt = """You are a precise technical recruiter. Score how well a candidate fits an open role.
Return ONLY valid JSON — no markdown, no text outside the JSON:
{
  "score": <integer 0-100>,
  "reason": "<one clear sentence on the fit, from the recruiter's perspective>",
  "matched_skills": ["<candidate skill the role needs>", ...],
  "missing_skills": ["<role requirement the candidate lacks>", ...]
}
Scoring guide: 0-49 = weak, 50-74 = worth a look, 75-100 = strong fit. Weigh skills overlap, years of experience against the required seniority, and role alignment."""

    r = candidate.get("parsed_resume", {})
    user_prompt = f"""OPEN ROLE:
Title: {posting.get('title', '')}
Seniority: {posting.get('experience_level', '')}
Location: {posting.get('location', '—')} ({posting.get('job_type', '')})
Required skills: {', '.join(posting.get('skills', [])) or 'see description'}
Description:
{posting.get('description', '')[:2000]}

CANDIDATE:
Name: {candidate.get('full_name') or r.get('name') or 'Candidate'}
Target role: {r.get('target_role', '')}
Years of experience: {r.get('years_experience', 0)}
Skills: {', '.join(r.get('skills', []))}
Summary: {r.get('summary', '')}
Recent roles: {' | '.join(f"{e.get('title', '')} at {e.get('company', '')}" for e in r.get('experience', [])[:2])}"""

    response = await groq_service.call(
        user_prompt,
        system_prompt,
        model=settings.GROQ_FAST_MODEL,
        meterUserId=posting.get("recruiter_id")
    )

    parsed = groq_service.parse_json(response)
    if parsed and isinstance(parsed.get("score"), (int, float)):
        return {
            "score": max(0, min(100, int(round(parsed["score"])))),
            "reason": parsed.get("reason", "Fit score computed."),
            "matched_skills": parsed.get("matched_skills", []) if isinstance(parsed.get("matched_skills"), list) else [],
            "missing_skills": parsed.get("missing_skills", []) if isinstance(parsed.get("missing_skills"), list) else [],
        }

    return {"score": 50, "reason": "Could not parse AI response — defaulting to 50.", "matched_skills": [], "missing_skills": []}


async def match_candidates_for_posting(posting_id: str) -> Dict[str, int]:
    posting = await supabase_service.get_job_posting(posting_id)
    if not posting:
        raise ValueError("Posting not found.")

    # Get candidates from talent pool
    candidates_result = supabase_service.client.table("profiles").select(
        "user_id,full_name,parsed_resume"
    ).eq("account_type", "seeker").eq("open_to_work", True).not_.is_("parsed_resume", "null").limit(50).execute()

    candidates = candidates_result.data or []
    if not candidates:
        return {"scored": 0}

    # Get existing matches
    existing = supabase_service.client.table("candidate_matches").select("candidate_id").eq("posting_id", posting_id).execute()
    done: Set[str] = set(cm["candidate_id"] for cm in (existing.data or []))

    pending = [c for c in candidates if c["user_id"] not in done and c.get("parsed_resume")]

    scored = 0
    import asyncio

    async def score_one(candidate: Dict[str, Any]):
        nonlocal scored
        try:
            result = await score_candidate(posting, candidate)
            await supabase_service.insert_candidate_match({
                "posting_id": posting_id,
                "candidate_id": candidate["user_id"],
                "match_score": result["score"],
                "match_reason": result["reason"],
                "matched_skills": result["matched_skills"],
                "missing_skills": result["missing_skills"],
                "status": "new",
            })
            scored += 1
        except Exception as e:
            logger.warning(f"Candidate scoring failed for {candidate['user_id']}: {e}")

    # Process in batches of 6
    for i in range(0, len(pending), 6):
        chunk = pending[i:i + 6]
        await asyncio.gather(*[score_one(c) for c in chunk])

    return {"scored": scored}