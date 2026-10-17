"""Recruiter side: postings, AI-ranked candidates from the opt-in talent pool, Proof of Fit
invitations and decisions.

Contact details (email, phone, LinkedIn) reach a recruiter only after they advance a candidate
and the candidate accepts the introduction."""

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agents.candidates import match_candidates_for_posting
from app.agents.proof import decline_feedback
from app.auth import AuthUser
from app.db import first, get_db
from app.errors import ApiError
from app.ratelimit import ai_user, general_user
from app.services.email import send_proof_decision, send_proof_invite

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
    on_time = missed = 0
    if postings:
        rows = (await db.table("candidate_matches").select("posting_id, decided_by")
                .in_("posting_id", [p["id"] for p in postings]).execute()).data or []
        for r in rows:
            counts[r["posting_id"]] = counts.get(r["posting_id"], 0) + 1
            on_time += r.get("decided_by") == "recruiter"
            missed += r.get("decided_by") == "timeout"
    return {
        "postings": [{**p, "candidate_count": counts.get(p["id"], 0)} for p in postings],
        # Share of finished proofs the recruiter decided before the deadline; None until one is due.
        "response_rate": round(on_time / (on_time + missed) * 100) if on_time + missed else None,
    }


class PostingBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=20_000)
    location: str | None = None
    job_type: JobType = "onsite"
    experience_level: Level = "mid"
    skills: list[str] = []
    salary_range: str | None = None
    response_sla_days: int = Field(default=7, ge=1, le=30)


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
        "response_sla_days": body.response_sla_days,
    }).execute()
    return {"id": res.data[0]["id"]}


# Fields in a parsed resume that identify or reach the person. Hidden until the intro is accepted.
_CONTACT_KEYS = {"email", "phone", "linkedin", "linkedin_url", "github", "website", "address"}


def candidate_view(match: dict[str, Any], profile: dict[str, Any], proof: dict[str, Any] | None) -> dict[str, Any]:
    connected = match.get("candidate_response") == "accepted"
    resume = profile.get("parsed_resume") or {}
    candidate: dict[str, Any] = {
        "full_name": profile.get("full_name"),
        "parsed_resume": resume if connected else {k: v for k, v in resume.items() if k not in _CONTACT_KEYS},
        "email": profile.get("email") if connected else None,
        "linkedin_url": profile.get("linkedin_url") if connected else None,
    }
    return {**match, "candidate": candidate,
            "proof": {k: proof.get(k) for k in ("id", "score", "report", "completed_at")} if proof else None}


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
        profiles = {p["user_id"]: p for p in rows if p.get("open_to_work")}
    proof_ids = [m["proof_id"] for m in matches if m.get("proof_id")]
    proofs: dict[str, dict] = {}
    if proof_ids:
        rows = (await db.table("skill_proofs").select("id, score, report, completed_at")
                .in_("id", proof_ids).eq("status", "completed").execute()).data or []
        proofs = {p["id"]: p for p in rows}

    me = await first(db.table("profiles").select("match_threshold").eq("user_id", user.id))
    return {
        "posting": posting,
        "candidates": [candidate_view(m, profiles[m["candidate_id"]], proofs.get(m.get("proof_id") or ""))
                       for m in matches if m["candidate_id"] in profiles],
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


async def _owned_match(user_id: str, match_id: UUID) -> tuple[dict[str, Any], dict[str, Any]]:
    db = await get_db()
    cm = await first(db.table("candidate_matches").select("*").eq("id", str(match_id)))
    if not cm:
        raise ApiError(404, "Not found")
    return cm, await _owned_posting(user_id, cm["posting_id"])


async def _candidate_contact(candidate_id: str) -> dict[str, Any]:
    db = await get_db()
    return await first(db.table("profiles").select("full_name, email, open_to_work").eq("user_id", candidate_id)) or {}


@router.post("/candidates/{match_id}/invite")
async def invite_candidate(match_id: UUID, user: AuthUser = Depends(general_user)) -> dict:
    """Invite a candidate to take this role's Proof of Fit. Emails them once."""
    cm, posting = await _owned_match(user.id, match_id)
    if cm.get("invited_at"):
        return {"ok": True, "invited_at": cm["invited_at"]}
    candidate = await _candidate_contact(cm["candidate_id"])
    if not candidate.get("open_to_work"):
        raise ApiError(409, "This candidate has left the talent pool.")
    now = datetime.now(timezone.utc).isoformat()
    db = await get_db()
    await db.table("candidate_matches").update({"invited_at": now}).eq("id", cm["id"]).execute()
    if candidate.get("email"):
        await send_proof_invite(candidate["email"], candidate.get("full_name") or "", posting)
    return {"ok": True, "invited_at": now}


class DecisionBody(BaseModel):
    decision: Literal["advanced", "declined"]
    feedback: str | None = Field(default=None, max_length=1000)


@router.post("/candidates/{match_id}/decision")
async def decide(match_id: UUID, body: DecisionBody, user: AuthUser = Depends(general_user)) -> dict:
    """Advance (asks the candidate to accept an introduction) or decline, with feedback either way."""
    cm, posting = await _owned_match(user.id, match_id)
    if not cm.get("proof_id"):
        raise ApiError(409, "Decide once the candidate has finished their proof.")
    if cm["decision"] != "pending":
        raise ApiError(409, "You've already decided on this candidate.")
    feedback = (body.feedback or "").strip() or None
    db = await get_db()
    if body.decision == "declined" and not feedback:
        proof = await first(db.table("skill_proofs").select("report").eq("id", cm["proof_id"]))
        feedback = decline_feedback((proof or {}).get("report"))
    res = await db.table("candidate_matches").update({
        "decision": body.decision, "decided_by": "recruiter", "decided_at": datetime.now(timezone.utc).isoformat(),
        "feedback": feedback, "status": "shortlisted" if body.decision == "advanced" else "rejected",
    }).eq("id", cm["id"]).eq("decision", "pending").execute()
    if not res.data:  # a concurrent request (or the deadline job) decided first
        raise ApiError(409, "You've already decided on this candidate.")
    candidate = await _candidate_contact(cm["candidate_id"])
    if candidate.get("email"):
        await send_proof_decision(candidate["email"], candidate.get("full_name") or "", posting, body.decision, feedback)
    return {"ok": True, "decision": body.decision, "feedback": feedback}
