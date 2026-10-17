"""Recruiter side: postings and AI-ranked candidates from the opt-in talent pool."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agents.candidates import match_candidates_for_posting
from app.auth import AuthUser
from app.db import first, get_db
from app.errors import ApiError
from app.ratelimit import ai_user, general_user

router = APIRouter(prefix="/api/hire", tags=["hire"])

JobType = Literal["remote", "hybrid", "onsite", "unknown"]
Level = Literal["entry", "mid", "senior", "lead", "unknown"]


async def _owned_posting(user_id: str, posting_id: str) -> dict:
    db = await get_db()
    try:
        posting = await first(db.table("job_postings").select("*").eq("id", posting_id))
    except Exception:
        posting = None
    if not posting:
        raise ApiError(404, "Not found")
    if posting["recruiter_id"] != user_id:
        raise ApiError(403, "Forbidden")
    return posting


class ActivateBody(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)


@router.post("/activate")
async def activate(body: ActivateBody, user: AuthUser = Depends(general_user)) -> dict:
    """Switch the account to recruiter mode (Settings → Account type)."""
    db = await get_db()
    await db.table("profiles").update({
        "account_type": "recruiter",
        "company_name": body.company_name.strip(),
        "onboarded": True,
    }).eq("user_id", user.id).execute()
    return {"ok": True}


@router.get("/postings")
async def list_postings(user: AuthUser = Depends(general_user)) -> dict:
    db = await get_db()
    postings = (await db.table("job_postings").select("*").eq("recruiter_id", user.id)
                .order("created_at", desc=True).execute()).data or []
    counts: dict[str, int] = {}
    if postings:
        rows = (await db.table("candidate_matches").select("posting_id")
                .in_("posting_id", [p["id"] for p in postings]).execute()).data or []
        for r in rows:
            counts[r["posting_id"]] = counts.get(r["posting_id"], 0) + 1
    return {"postings": [{**p, "candidate_count": counts.get(p["id"], 0)} for p in postings]}


class PostingBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=20_000)
    location: str | None = None
    job_type: JobType = "onsite"
    experience_level: Level = "mid"
    skills: list[str] = []
    salary_range: str | None = None


@router.post("/postings")
async def create_posting(body: PostingBody, user: AuthUser = Depends(general_user)) -> dict:
    db = await get_db()
    profile = await first(db.table("profiles").select("account_type").eq("user_id", user.id))
    if not profile or profile.get("account_type") != "recruiter":
        raise ApiError(403, "Switch to a recruiter account in Settings first.")
    res = await db.table("job_postings").insert({
        "recruiter_id": user.id,
        "title": body.title,
        "company": body.company,
        "location": body.location or None,
        "job_type": body.job_type,
        "experience_level": body.experience_level,
        "description": body.description,
        "skills": [s.strip() for s in body.skills if s and s.strip()],
        "salary_range": body.salary_range or None,
    }).execute()
    return {"id": res.data[0]["id"]}


@router.get("/postings/{posting_id}/candidates")
async def list_candidates(posting_id: str, user: AuthUser = Depends(general_user)) -> dict:
    posting = await _owned_posting(user.id, posting_id)
    db = await get_db()
    matches = (await db.table("candidate_matches").select("*").eq("posting_id", posting_id)
               .order("match_score", desc=True).execute()).data or []

    profiles: dict[str, dict] = {}
    ids = [m["candidate_id"] for m in matches]
    if ids:
        rows = (await db.table("profiles")
                .select("user_id, full_name, email, linkedin_url, parsed_resume, open_to_work")
                .in_("user_id", ids).execute()).data or []
        # Seekers who've since left the talent pool drop out of the list.
        profiles = {p["user_id"]: {k: p[k] for k in ("full_name", "email", "linkedin_url", "parsed_resume")}
                    for p in rows if p.get("open_to_work")}

    me = await first(db.table("profiles").select("match_threshold").eq("user_id", user.id))
    return {
        "posting": posting,
        "candidates": [{**m, "candidate": profiles[m["candidate_id"]]} for m in matches if m["candidate_id"] in profiles],
        "threshold": (me or {}).get("match_threshold") or 70,
    }


@router.post("/postings/{posting_id}/candidates")
async def score_candidates(posting_id: str, user: AuthUser = Depends(ai_user)) -> dict:
    posting = await _owned_posting(user.id, posting_id)
    return await match_candidates_for_posting(posting)


class CandidateStatusBody(BaseModel):
    status: Literal["new", "shortlisted", "contacted", "rejected"]


@router.patch("/candidates/{match_id}")
async def set_candidate_status(match_id: str, body: CandidateStatusBody, user: AuthUser = Depends(general_user)) -> dict:
    db = await get_db()
    try:
        cm = await first(db.table("candidate_matches").select("posting_id").eq("id", match_id))
    except Exception:
        cm = None
    if not cm:
        raise ApiError(404, "Not found")
    await _owned_posting(user.id, cm["posting_id"])
    await db.table("candidate_matches").update({"status": body.status}).eq("id", match_id).execute()
    return {"ok": True}
