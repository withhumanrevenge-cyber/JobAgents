"""Digest emails and the scheduled sync trigger."""

import asyncio
import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.auth import AuthUser
from app.config import get_settings
from app.db import first, get_db
from app.errors import ApiError
from app.jobs.daily_sync import run_daily_sync
from app.ratelimit import limited_user
from app.services.email import send_match_digest, send_test_email

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["misc"])

email_user = limited_user("email", 5, 3600)


class DigestBody(BaseModel):
    mode: Literal["digest", "test"] = "digest"


@router.post("/notifications/digest")
async def digest(body: DigestBody | None = None, user: AuthUser = Depends(email_user)) -> dict:
    db = await get_db()
    profile = await first(db.table("profiles").select("full_name, email, match_threshold").eq("user_id", user.id)) or {}
    to = profile.get("email") or user.email or ""
    if not to:
        raise ApiError(400, "Add an email address in settings first.")

    if body and body.mode == "test":
        sent, reason = await send_test_email(to, profile.get("full_name") or "")
        if not sent:
            raise ApiError(502, reason or "Failed to send.")
        return {"sent": True, "to": to}

    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    matches = (await db.table("matches").select("*, job:jobs(*)").eq("user_id", user.id)
               .gte("match_score", profile.get("match_threshold") or 70).gte("created_at", since)
               .order("match_score", desc=True).limit(20).execute()).data or []
    if not matches:
        return {"sent": False, "reason": "No new matches above your threshold in the last 7 days."}
    sent, reason = await send_match_digest(to, profile.get("full_name") or "", matches)
    if not sent:
        raise ApiError(502, reason or "Failed to send.")
    return {"sent": True, "to": to, "count": len(matches)}


_sync_task: asyncio.Task | None = None


@router.api_route("/cron/sync", methods=["GET", "POST"], status_code=202, include_in_schema=False)
async def cron_sync(request: Request) -> dict:
    secret = get_settings().CRON_SECRET
    if not secret:
        raise ApiError(503, "Cron is not configured.")
    if not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {secret}"):
        raise ApiError(401, "Unauthorized")

    global _sync_task
    if _sync_task and not _sync_task.done():
        raise ApiError(409, "A sync is already running.")
    # Runs past the HTTP response so the scheduler's request can't time out mid-sync.
    _sync_task = asyncio.create_task(run_daily_sync())
    _sync_task.add_done_callback(_log_crash)
    return {"started": True}


def _log_crash(task: asyncio.Task) -> None:
    if not task.cancelled() and task.exception():
        log.error("Daily sync crashed", exc_info=task.exception())
