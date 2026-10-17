"""Scores opted-in seekers (the talent pool) against a recruiter's posting."""

import asyncio
import logging
from typing import Any

from app.db import get_db
from app.errors import ApiError
from app.services.ai import AIContext, get_ai
from app.services.llm import parse_json

log = logging.getLogger(__name__)

POOL_SIZE = 50
# Scoring runs on the recruiter's AI. On the hosted trial (Free, no key) it's capped.
TRIAL_POOL_SIZE = 10
CONCURRENCY = 6

SYSTEM_PROMPT = """You are a precise technical recruiter. Score how well a candidate fits an open role.
Return ONLY valid JSON, no markdown, no text outside the JSON:
{
  "score": <integer 0-100>,
  "reason": "<one clear sentence on the fit, from the recruiter's perspective>",
  "matched_skills": ["<candidate skill the role needs>", ...],
  "missing_skills": ["<role requirement the candidate lacks>", ...]
}
Scoring guide: 0-49 = weak, 50-74 = worth a look, 75-100 = strong fit. Weigh skills overlap, years of experience against the required seniority, and role alignment."""


async def _score(ai: AIContext, posting: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any] | None:
    r = candidate["parsed_resume"]
    recent = " | ".join(f"{e.get('title')} at {e.get('company')}" for e in (r.get("experience") or [])[:2])
    prompt = (
        f"OPEN ROLE:\nTitle: {posting['title']}\nSeniority: {posting.get('experience_level')}\n"
        f"Location: {posting.get('location') or '-'} ({posting.get('job_type')})\n"
        f"Required skills: {', '.join(posting.get('skills') or []) or 'see description'}\n"
        f"Description:\n{(posting.get('description') or '')[:2000]}\n\n"
        f"CANDIDATE:\nName: {candidate.get('full_name') or r.get('name') or 'Candidate'}\n"
        f"Target role: {r.get('target_role')}\nYears of experience: {r.get('years_experience')}\n"
        f"Skills: {', '.join(r.get('skills') or [])}\nSummary: {r.get('summary') or ''}\nRecent roles: {recent}"
    )
    reply = await ai.call(prompt, SYSTEM_PROMPT, fast=True)
    parsed = parse_json(reply)
    if not isinstance(parsed, dict) or not isinstance(parsed.get("score"), (int, float)):
        return None  # not saved, so the candidate is retried next time
    as_list = lambda v: [str(x) for x in v] if isinstance(v, list) else []  # noqa: E731
    return {
        "score": max(0, min(100, round(parsed["score"]))),
        "reason": parsed.get("reason") or "Fit score computed.",
        "matched_skills": as_list(parsed.get("matched_skills")),
        "missing_skills": as_list(parsed.get("missing_skills")),
    }


async def match_candidates_for_posting(posting: dict[str, Any]) -> dict[str, int]:
    ai = await get_ai(posting["recruiter_id"])
    pool_size = TRIAL_POOL_SIZE if ai.mode == "trial" else POOL_SIZE
    db = await get_db()
    existing = await db.table("candidate_matches").select("candidate_id").eq("posting_id", posting["id"]).execute()
    done = {r["candidate_id"] for r in existing.data or []}

    # Most recently updated profiles first, so the pool isn't the same 50 people forever.
    res = await (
        db.table("profiles").select("user_id, full_name, parsed_resume")
        .eq("account_type", "seeker").eq("open_to_work", True).not_.is_("parsed_resume", "null")
        .neq("user_id", posting["recruiter_id"])
        .order("updated_at", desc=True).limit(pool_size + len(done))
        .execute()
    )
    pending = [c for c in res.data or [] if c["user_id"] not in done and c.get("parsed_resume")][:pool_size]

    scored = 0
    sem = asyncio.Semaphore(CONCURRENCY)

    async def one(c: dict[str, Any]) -> None:
        nonlocal scored
        async with sem:
            try:
                result = await _score(ai, posting, c)
            except ApiError as e:
                if e.extra.get("code"):  # key, quota or model problem: retrying the rest won't help
                    raise
                log.warning("Candidate scoring failed for %s: %s", c["user_id"], e.message)
                return
            except Exception as e:
                log.warning("Candidate scoring failed for %s: %s", c["user_id"], e)
                return
        if not result:
            return
        try:
            await db.table("candidate_matches").upsert({
                "posting_id": posting["id"],
                "candidate_id": c["user_id"],
                "match_score": result["score"],
                "match_reason": result["reason"],
                "matched_skills": result["matched_skills"],
                "missing_skills": result["missing_skills"],
                "status": "new",
            }, on_conflict="posting_id,candidate_id", ignore_duplicates=True).execute()
            scored += 1
        except Exception:
            log.exception("Failed to save candidate match")

    await asyncio.gather(*(one(c) for c in pending))
    return {"scored": scored}
