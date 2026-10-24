from typing import Any

from app.db import first, get_db
from app.errors import ApiError


async def get_job(job_id: str) -> dict[str, Any]:
    db = await get_db()
    try:
        job = await first(db.table("jobs").select("*").eq("id", job_id))
    except Exception:  # malformed uuid
        job = None
    if not job:
        raise ApiError(404, "Job not found.")
    return job


async def ensure_match(user_id: str, job_id: str) -> str:
    """The id of the user's match row for this job, creating an unscored one (-1) if needed.
    Generated resumes, cover letters and interview prep are stored on the match row; without
    one, work the user paid credits for on an unscored job was silently dropped."""
    db = await get_db()
    await db.table("matches").upsert({
        "user_id": user_id,
        "job_id": job_id,
        "match_score": -1,
        "match_reason": "Not scored by AI yet.",
        "matched_skills": [],
        "missing_skills": [],
        "status": "pending",
    }, on_conflict="user_id,job_id", ignore_duplicates=True).execute()
    row = await first(db.table("matches").select("id").eq("user_id", user_id).eq("job_id", job_id))
    if not row:
        raise ApiError(500, "Could not save your result.")
    return row["id"]


async def save_to_match(user_id: str, job_id: str, fields: dict[str, Any]) -> str:
    match_id = await ensure_match(user_id, job_id)
    db = await get_db()
    await db.table("matches").update(fields).eq("id", match_id).eq("user_id", user_id).execute()
    return match_id


async def get_parsed_resume(user_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """(profile, parsed_resume), or 400 if the user hasn't uploaded a resume. Checked before
    charging credits: without a resume the AI has nothing true to tailor."""
    db = await get_db()
    profile = await first(db.table("profiles").select("*").eq("user_id", user_id))
    resume = (profile or {}).get("parsed_resume")
    if not profile or not resume:
        raise ApiError(400, "Upload your resume in Settings first.")
    return profile, resume
