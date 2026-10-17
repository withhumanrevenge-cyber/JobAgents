"""Proof of Fit, seeker side: take a proof, see the report, share it, answer introductions."""

import asyncio
import logging
import secrets
import weakref
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agents import proof as P
from app.auth import AuthUser
from app.db import first, get_db
from app.errors import ApiError
from app.plans import PLAN_CONFIG, effective_plan
from app.ratelimit import ai_user, general_user, limited_ip, limited_user
from app.services.ai import get_hosted_ai

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["proofs"])

answer_user = limited_user("proof_answer", 20)
public_ip = limited_ip("proof_public", 60)

_PROOF_FIELDS = "id, user_id, posting_id, job_id, role_title, skills, status, steps, score, report, is_public, " \
                "public_slug, created_at, completed_at"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _view(proof: dict[str, Any]) -> dict[str, Any]:
    """What the owner sees. Unanswered future questions never leave the server."""
    steps = proof.get("steps") or []
    out = {k: proof.get(k) for k in ("id", "posting_id", "job_id", "role_title", "skills", "status", "score",
                                     "report", "is_public", "public_slug", "created_at", "completed_at")}
    index = P.current_index(steps) if proof["status"] == "in_progress" else None
    if index is not None:
        step = steps[index]
        out["step"] = {
            "number": index + 1, "total": P.total_steps(steps),
            "kind": step["kind"], "skill": step["skill"], "question": step["question"],
            "asked_at": step.get("asked_at"), "time_limit_s": P.TIME_LIMIT_S[step["kind"]],
        }
    else:
        out["step"] = None
    if proof["status"] == "completed":
        out["answers"] = [{k: s.get(k) for k in ("kind", "skill", "question", "answer", "seconds", "pasted", "late")}
                          for s in steps]
    return out


async def _own_proof(user_id: str, proof_id: UUID) -> dict[str, Any]:
    db = await get_db()
    proof = await first(db.table("skill_proofs").select(_PROOF_FIELDS).eq("id", str(proof_id)).eq("user_id", user_id))
    if not proof:
        raise ApiError(404, "Not found")
    return proof


async def _proofs_this_month(user_id: str) -> int:
    db = await get_db()
    month_start = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    res = await (db.table("skill_proofs").select("id", count="exact").eq("user_id", user_id)
                 .gte("created_at", month_start.isoformat()).limit(1).execute())
    return res.count or 0


@router.get("/proofs")
async def list_proofs(user: AuthUser = Depends(general_user)) -> dict:
    db = await get_db()
    proofs = (await db.table("skill_proofs")
              .select("id, posting_id, job_id, role_title, status, score, is_public, public_slug, created_at, completed_at")
              .eq("user_id", user.id).order("created_at", desc=True).limit(50).execute()).data or []
    invitations = (await db.table("candidate_matches")
                   .select("id, posting_id, invited_at, proof_id, decision, decision_due_at, decided_at, feedback, "
                           "candidate_response, posting:job_postings(title, company, location, job_type, response_sla_days)")
                   .eq("candidate_id", user.id).not_.is_("invited_at", "null")
                   .order("invited_at", desc=True).limit(50).execute()).data or []
    profile = await first(db.table("profiles").select("plan, plan_expires_at").eq("user_id", user.id))
    plan = effective_plan(profile)
    return {
        "proofs": proofs,
        "invitations": invitations,
        "allowance": {"used": await _proofs_this_month(user.id), "limit": PLAN_CONFIG[plan]["proofsPerMonth"]},
    }


class StartBody(BaseModel):
    # An invitation's posting, or a job from the feed. Neither: the user's own target role.
    posting_id: UUID | None = None
    job_id: UUID | None = None


async def _target(user_id: str, body: StartBody, profile: dict[str, Any]) -> dict[str, Any]:
    db = await get_db()
    resume = profile.get("parsed_resume") or {}
    if body.posting_id:
        invited = await first(db.table("candidate_matches").select("id").eq("posting_id", str(body.posting_id))
                              .eq("candidate_id", user_id).not_.is_("invited_at", "null"))
        if not invited:
            raise ApiError(403, "This role's proof is by invitation only.")
        posting = await first(db.table("job_postings").select("title, company, description, skills, experience_level")
                              .eq("id", str(body.posting_id)))
        if not posting:
            raise ApiError(404, "This role is no longer open.")
        return {"posting_id": str(body.posting_id), "job_id": None, "role_title": f"{posting['title']} at {posting['company']}",
                "skills": posting.get("skills") or [], "description": posting.get("description") or "",
                "seniority": posting.get("experience_level")}
    if body.job_id:
        job = await first(db.table("jobs").select("title, company, description, tags, experience_level").eq("id", str(body.job_id)))
        if not job:
            raise ApiError(404, "Job not found.")
        return {"posting_id": None, "job_id": str(body.job_id), "role_title": f"{job['title']} at {job['company']}",
                "skills": (job.get("tags") or [])[:10], "description": job.get("description") or "",
                "seniority": job.get("experience_level")}
    role = next((r for r in profile.get("target_roles") or [] if r), None) or resume.get("target_role")
    if not role:
        raise ApiError(400, "Set a target role in Settings, or start a proof from a job.")
    return {"posting_id": None, "job_id": None, "role_title": role, "skills": (resume.get("skills") or [])[:8],
            "description": f"A typical {role} role.", "seniority": None}


@router.post("/proofs")
async def start_proof(body: StartBody, user: AuthUser = Depends(ai_user)) -> dict:
    db = await get_db()
    profile = await first(db.table("profiles").select("plan, plan_expires_at, target_roles, parsed_resume")
                          .eq("user_id", user.id)) or {}
    target = await _target(user.id, body, profile)

    # Same target, still in progress and not expired: carry on with it instead of spending another.
    since = (_now() - timedelta(seconds=P.EXPIRES_AFTER_S)).isoformat()
    q = db.table("skill_proofs").select(_PROOF_FIELDS).eq("user_id", user.id).eq("status", "in_progress").gte("created_at", since)
    q = q.eq("posting_id", target["posting_id"]) if target["posting_id"] else q.is_("posting_id", "null")
    q = q.eq("job_id", target["job_id"]) if target["job_id"] else q.is_("job_id", "null")
    existing = await first(q.eq("role_title", target["role_title"]))
    if existing:
        return _view(existing)

    plan = effective_plan(profile)
    limit = PLAN_CONFIG[plan]["proofsPerMonth"]
    if await _proofs_this_month(user.id) >= limit:
        raise ApiError(402, f"You've used all {limit} Proof of Fit runs this month.", code="proof_limit")

    ai = get_hosted_ai(user.id, plan)
    questions = await P.generate_questions(ai, target["role_title"], target["skills"], target["description"], target["seniority"])
    res = await db.table("skill_proofs").insert({
        "user_id": user.id, "posting_id": target["posting_id"], "job_id": target["job_id"],
        "role_title": target["role_title"], "skills": [q["skill"] for q in questions],
        "steps": P.new_steps(questions, _now()),
    }).execute()
    return _view(res.data[0])


@router.get("/proofs/{proof_id}")
async def get_proof(proof_id: UUID, user: AuthUser = Depends(general_user)) -> dict:
    return _view(await _own_proof(user.id, proof_id))


class AnswerBody(BaseModel):
    answer: str = Field(max_length=P.MAX_ANSWER_CHARS)
    # The browser reports a paste into the answer box. Shown to recruiters as a fact, never a verdict.
    pasted: bool = False


# Answers to one proof are handled one at a time, so a double submit can't skip a question.
_proof_locks: "weakref.WeakValueDictionary[str, asyncio.Lock]" = weakref.WeakValueDictionary()


@router.post("/proofs/{proof_id}/answer")
async def answer(proof_id: UUID, body: AnswerBody, user: AuthUser = Depends(answer_user)) -> dict:
    key = str(proof_id)
    lock = _proof_locks.get(key)
    if lock is None:
        lock = _proof_locks[key] = asyncio.Lock()
    async with lock:
        return await _answer(user, proof_id, body)


async def _answer(user: AuthUser, proof_id: UUID, body: AnswerBody) -> dict:
    proof = await _own_proof(user.id, proof_id)
    if proof["status"] != "in_progress":
        raise ApiError(409, "This proof is already finished.")
    db = await get_db()
    now = _now()
    if datetime.fromisoformat(proof["created_at"].replace("Z", "+00:00")) < now - timedelta(seconds=P.EXPIRES_AFTER_S):
        await db.table("skill_proofs").update({"status": "abandoned"}).eq("id", proof["id"]).execute()
        raise ApiError(410, "This proof expired. Start a new one.")

    steps = proof["steps"]
    index = P.current_index(steps)
    if index is None:  # every answer is in, but grading failed last time: grade again
        return await _complete(proof, steps, user.id)

    P.record_answer(steps, index, body.answer, body.pasted, now)
    profile = await first(db.table("profiles").select("plan, plan_expires_at").eq("user_id", user.id))
    ai = get_hosted_ai(user.id, effective_plan(profile))
    if steps[index]["kind"] == "main":
        try:
            question = await P.follow_up(ai, proof["role_title"], steps[index])
        except ApiError as e:
            log.warning("Follow-up failed for proof %s: %s", proof["id"], e.message)
            question = None
        if question:
            P.insert_follow_up(steps, index, question, now)
    if P.start_next(steps, now):
        res = await db.table("skill_proofs").update({"steps": steps}).eq("id", proof["id"]).execute()
        return _view(res.data[0])
    # Save the answers before grading, so a grading failure doesn't lose them.
    await db.table("skill_proofs").update({"steps": steps}).eq("id", proof["id"]).execute()
    return await _complete(proof, steps, user.id)


async def _complete(proof: dict[str, Any], steps: list[dict[str, Any]], user_id: str) -> dict:
    db = await get_db()
    profile = await first(db.table("profiles").select("plan, plan_expires_at").eq("user_id", user_id))
    report = await P.grade(get_hosted_ai(user_id, effective_plan(profile)), proof["role_title"], steps)
    now = _now()
    res = await db.table("skill_proofs").update({
        "status": "completed", "steps": steps, "score": report["overall"], "report": report,
        "completed_at": now.isoformat(),
    }).eq("id", proof["id"]).execute()

    if proof.get("posting_id"):
        # Hand the proof to the inviting recruiter and start their response clock.
        posting = await first(db.table("job_postings").select("response_sla_days").eq("id", proof["posting_id"]))
        due = now + timedelta(days=(posting or {}).get("response_sla_days") or 7)
        await (db.table("candidate_matches")
               .update({"proof_id": proof["id"], "decision_due_at": due.isoformat()})
               .eq("posting_id", proof["posting_id"]).eq("candidate_id", user_id).eq("decision", "pending")
               .execute())
    return _view(res.data[0])


class ShareBody(BaseModel):
    is_public: bool


@router.patch("/proofs/{proof_id}")
async def share_proof(proof_id: UUID, body: ShareBody, user: AuthUser = Depends(general_user)) -> dict:
    proof = await _own_proof(user.id, proof_id)
    if proof["status"] != "completed":
        raise ApiError(409, "Finish the proof before sharing it.")
    fields: dict[str, Any] = {"is_public": body.is_public}
    if body.is_public and not proof.get("public_slug"):
        fields["public_slug"] = secrets.token_urlsafe(9)
    db = await get_db()
    res = await db.table("skill_proofs").update(fields).eq("id", proof["id"]).eq("user_id", user.id).execute()
    return _view(res.data[0])


class RespondBody(BaseModel):
    accept: bool


@router.post("/proofs/invitations/{match_id}/respond")
async def respond_to_intro(match_id: UUID, body: RespondBody, user: AuthUser = Depends(general_user)) -> dict:
    """The candidate's answer to a recruiter who advanced them. Accepting shares contact details."""
    db = await get_db()
    cm = await first(db.table("candidate_matches").select("id, decision, candidate_response")
                     .eq("id", str(match_id)).eq("candidate_id", user.id))
    if not cm:
        raise ApiError(404, "Not found")
    if cm["decision"] != "advanced":
        raise ApiError(409, "There's no introduction to answer yet.")
    if cm.get("candidate_response"):
        raise ApiError(409, "You've already answered this introduction.")
    response = "accepted" if body.accept else "declined"
    await (db.table("candidate_matches").update({"candidate_response": response})
           .eq("id", cm["id"]).eq("candidate_id", user.id).execute())
    return {"ok": True, "candidate_response": response}


@router.get("/public/proofs/{slug}", dependencies=[Depends(public_ip)])
async def public_proof(slug: str) -> dict:
    """A shared proof, for anyone with the link: the report and its quoted evidence, never the
    full answers or any contact details."""
    if not (8 <= len(slug) <= 32):
        raise ApiError(404, "Not found")
    db = await get_db()
    proof = await first(db.table("skill_proofs").select("user_id, role_title, score, report, completed_at")
                        .eq("public_slug", slug).eq("is_public", True).eq("status", "completed"))
    if not proof:
        raise ApiError(404, "Not found")
    profile = await first(db.table("profiles").select("full_name").eq("user_id", proof["user_id"]))
    return {"name": (profile or {}).get("full_name") or "Candidate", "role_title": proof["role_title"],
            "score": proof["score"], "report": proof["report"], "completed_at": proof["completed_at"]}
