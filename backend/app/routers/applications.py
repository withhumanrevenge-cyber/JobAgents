"""Smart Apply, resume tailoring, interview prep, and marking a job applied."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.agents import writing
from app.auth import AuthUser
from app.db import first, get_db
from app.errors import ApiError
from app.ratelimit import ai_user, general_user
from app.services.ai import ai_action
from app.services.matches import get_job, get_parsed_resume, save_to_match

router = APIRouter(prefix="/api", tags=["applications"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobBody(BaseModel):
    job_id: str


@router.post("/resume/tailor")
async def tailor(body: JobBody, user: AuthUser = Depends(ai_user)) -> dict:
    job = await get_job(body.job_id)
    profile, resume = await get_parsed_resume(user.id)
    async with ai_action(user.id, "tailor") as ai:
        tailored = await writing.tailor_resume(ai, job, profile, resume, user.email)
        match_id = await save_to_match(user.id, job["id"], {"tailored_resume_json": tailored})
    return {"resume_json": tailored, "match_id": match_id}


@router.post("/apply/smart")
async def smart_apply(body: JobBody, user: AuthUser = Depends(ai_user)) -> dict:
    job = await get_job(body.job_id)
    profile, resume = await get_parsed_resume(user.id)
    async with ai_action(user.id, "smart_apply") as ai:
        tailored = await writing.tailor_resume(ai, job, profile, resume, user.email)
        letter = await writing.cover_letter(ai, job, resume, tailored)
        match_id = await save_to_match(user.id, job["id"], {
            "tailored_resume_json": tailored,
            "cover_letter": letter,
            "cover_letter_generated_at": _now(),
        })
    return {"apply_url": job["url"], "tailored_resume": tailored, "cover_letter": letter, "match_id": match_id}


class InterviewBody(BaseModel):
    job_id: str | None = None
    match_id: str | None = None


@router.post("/interview/generate")
async def interview(body: InterviewBody, user: AuthUser = Depends(ai_user)) -> dict:
    job_id = body.job_id
    if not job_id and body.match_id:
        db = await get_db()
        row = await first(db.table("matches").select("job_id").eq("id", body.match_id).eq("user_id", user.id))
        job_id = row["job_id"] if row else None
    if not job_id:
        raise ApiError(400, "match_id or job_id is required.")

    job = await get_job(job_id)
    db = await get_db()
    profile = await first(db.table("profiles").select("parsed_resume").eq("user_id", user.id))
    async with ai_action(user.id, "interview") as ai:
        questions = await writing.interview_questions(ai, job, (profile or {}).get("parsed_resume"))
        match_id = await save_to_match(user.id, job["id"], {
            "interview_questions": questions,
            "interview_generated_at": _now(),
        })
    return {"questions": questions, "match_id": match_id}


class ApplyBody(BaseModel):
    match_id: str | None = None
    job_id: str | None = None
    notes: str | None = None


@router.post("/apply")
async def mark_applied(body: ApplyBody, user: AuthUser = Depends(general_user)) -> dict:
    """Mark a job applied. Accepts a match_id, or a job_id for a job the AI hasn't scored
    (an unscored match row is created for it)."""
    db = await get_db()
    fields: dict = {"status": "applied", "applied_at": _now()}
    if body.notes is not None:
        fields["notes"] = body.notes

    if body.match_id:
        res = await db.table("matches").update(fields).eq("id", body.match_id).eq("user_id", user.id).execute()
        if not res.data:
            raise ApiError(404, "Match record not found.")
        return {"success": True, "match_id": body.match_id}
    if body.job_id:
        job = await get_job(body.job_id)
        match_id = await save_to_match(user.id, job["id"], fields)
        return {"success": True, "match_id": match_id}
    raise ApiError(400, "Missing match_id or job_id.")
