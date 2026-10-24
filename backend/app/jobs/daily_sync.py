"""Daily job: refresh the jobs pool, score new jobs for every active user, email digests.

Run it either through POST /api/cron/sync (with the CRON_SECRET) or directly:
    python -m app.jobs.daily_sync
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.agents.job_fetcher import DEFAULT_QUERIES, sync_all_jobs
from app.agents.matching import match_jobs_for_user
from app.agents.proof import EXPIRES_AFTER_S, decline_feedback
from app.db import first, get_db, select_all
from app.plans import ALL_SOURCES, effective_plan
from app.services.email import send_followup, send_match_digest, send_proof_decision

log = logging.getLogger(__name__)

MAX_POOL_QUERIES = 6
MAX_POOL_COUNTRIES = 3
JOBS_PER_USER = 20


async def _refresh_pool() -> dict[str, Any]:
    db = await get_db()
    profiles = await select_all(lambda: db.table("profiles").select("target_roles, target_country, parsed_resume->>target_role").order("id"))
    queries: list[str] = []
    countries: list[str] = []
    for p in profiles:
        roles = [r for r in (p.get("target_roles") or []) if r] or ([p["target_role"]] if p.get("target_role") else [])
        queries += [r for r in roles if r not in queries]
        if p.get("target_country") and p["target_country"] not in countries:
            countries.append(p["target_country"])

    stats = await sync_all_jobs(queries[:MAX_POOL_QUERIES] or None, countries[:MAX_POOL_COUNTRIES] or None,
                                sources=ALL_SOURCES, adzuna_pages=3)
    # A rotating slice of default queries keeps the Indian pool fresh for users without targets.
    day = int(time.time() // 86_400)
    rotation = [DEFAULT_QUERIES[(day * 4 + i) % len(DEFAULT_QUERIES)] for i in range(4)]
    await sync_all_jobs(rotation, ["IN"], sources=["adzuna"], adzuna_pages=2)
    return stats


async def _digest(user: dict[str, Any]) -> bool:
    db = await get_db()
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    matches = (await db.table("matches").select("*, job:jobs(*)")
               .eq("user_id", user["user_id"]).gte("match_score", user.get("match_threshold") or 70)
               .gte("created_at", since).order("match_score", desc=True).limit(20).execute()).data or []
    if not matches:
        return False
    sent, reason = await send_match_digest(user["email"], user.get("full_name") or "", matches)
    if not sent:
        log.warning("Digest failed for %s: %s", user["user_id"], reason)
    return sent


async def _background_users() -> list[dict[str, Any]]:
    """Who gets matched overnight: paying users (hosted AI), and Free users who saved their own
    key and left background matching on. Free users without a key aren't matched on our key in
    the background; they can still run Find jobs themselves. Least recently matched first, so a
    run that hits the time budget leaves the rest for tomorrow instead of starving the same
    users every day."""
    db = await get_db()
    rows = await select_all(lambda: db.table("profiles")
                            .select("user_id, full_name, email, match_threshold, email_notifications, plan, "
                                    "plan_expires_at, target_roles, resume_name:parsed_resume->>name")
                            .eq("account_type", "seeker")
                            .order("last_matched_at", desc=False, nullsfirst=True).order("id"))
    keys = await select_all(lambda: db.table("user_ai_keys").select("user_id, status, background_matching").order("user_id"))
    own_key = {k["user_id"] for k in keys if k.get("status") != "invalid" and k.get("background_matching", True)}
    return [
        u for u in rows
        if (u.get("resume_name") or any(u.get("target_roles") or []))
        and (effective_plan(u) != "free" or u["user_id"] in own_key)
    ]


async def _followups() -> int:
    """Ask "did you hear back?" a week after a user marks a job applied. Their answer (the
    status they set) is how JobAgent measures interview rate."""
    db = await get_db()
    now = datetime.now(timezone.utc)
    rows = await select_all(lambda: db.table("matches").select("user_id, job:jobs(id, title, company)")
                            .eq("status", "applied")
                            .gte("applied_at", (now - timedelta(days=8)).isoformat())
                            .lt("applied_at", (now - timedelta(days=7)).isoformat())
                            .order("id"))
    by_user: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        if r.get("job"):
            by_user.setdefault(r["user_id"], []).append(r["job"])
    sent = 0
    for user_id, jobs in by_user.items():
        profile = await first(db.table("profiles").select("full_name, email, email_notifications").eq("user_id", user_id))
        if profile and profile.get("email") and profile.get("email_notifications"):
            ok, _ = await send_followup(profile["email"], profile.get("full_name") or "", jobs)
            sent += ok
    return sent


async def _expire_decisions() -> int:
    """The response guarantee: a finished proof the recruiter hasn't decided on by the deadline
    is declined automatically, the candidate gets feedback from their report, and the miss
    counts against the recruiter's response rate."""
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    rows = await select_all(lambda: db.table("candidate_matches")
                            .select("id, candidate_id, proof_id, posting:job_postings(title, company)")
                            .eq("decision", "pending").not_.is_("decision_due_at", "null").lt("decision_due_at", now)
                            .order("id"))
    expired = 0
    for r in rows:
        proof = await first(db.table("skill_proofs").select("report").eq("id", r["proof_id"])) if r.get("proof_id") else None
        feedback = ("The team didn't respond within the promised window, so this application is closed. "
                    + decline_feedback((proof or {}).get("report")).removeprefix("The team decided not to move forward this time. "))
        res = await db.table("candidate_matches").update({
            "decision": "declined", "decided_by": "timeout", "decided_at": now, "feedback": feedback, "status": "rejected",
        }).eq("id", r["id"]).eq("decision", "pending").execute()
        if not res.data:
            continue  # the recruiter decided meanwhile
        expired += 1
        profile = await first(db.table("profiles").select("full_name, email").eq("user_id", r["candidate_id"]))
        if profile and profile.get("email") and r.get("posting"):
            await send_proof_decision(profile["email"], profile.get("full_name") or "", r["posting"], "declined", feedback)
    return expired


async def _abandon_stale_proofs() -> None:
    db = await get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=EXPIRES_AFTER_S)).isoformat()
    await db.table("skill_proofs").update({"status": "abandoned"}).eq("status", "in_progress").lt("created_at", cutoff).execute()


async def run_daily_sync(time_budget_s: int = 25 * 60) -> dict[str, Any]:
    started = time.monotonic()
    stats: dict[str, Any] = {"decisions_expired": 0}
    # Before matching, which can stop early on the time budget: the response guarantee must
    # run every day.
    try:
        stats["decisions_expired"] = await _expire_decisions()
        await _abandon_stale_proofs()
    except Exception:
        log.exception("Proof deadlines failed")

    pool = await _refresh_pool()
    users = await _background_users()

    stats.update({"users": len(users), "matched_users": 0, "emails_sent": 0, "followups_sent": 0, "errors": 0})
    for user in users:
        if time.monotonic() - started > time_budget_s:
            break
        try:
            result = await match_jobs_for_user(user["user_id"], limit=JOBS_PER_USER)
            stats["matched_users"] += 1
            if result["matched"] and user.get("email_notifications") and user.get("email"):
                stats["emails_sent"] += await _digest(user)
        except Exception:
            stats["errors"] += 1
            log.exception("Daily sync failed for user %s", user["user_id"])

    try:
        stats["followups_sent"] = await _followups()
    except Exception:
        log.exception("Follow-up emails failed")

    log.info("Daily sync done: pool=%s stats=%s", pool, stats)
    return {"jobSync": pool, **stats}


if __name__ == "__main__":
    from app.observability import init_sentry

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    init_sentry()
    print(asyncio.run(run_daily_sync()))
