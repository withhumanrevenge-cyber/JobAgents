from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.agents.job_fetcher import sync_all_jobs
from app.agents.matching import match_jobs_for_user
from app.auth import AuthUser
from app.countries import COUNTRY_NAME, DEFAULT_COUNTRY
from app.db import first, get_db
from app.errors import ApiError
from app.plans import effective_plan, sources_for
from app.ratelimit import ai_user, general_user, match_user
from app.services.matches import get_job

router = APIRouter(prefix="/api", tags=["jobs"])

MAX_QUERIES = 5
# Company boards change slowly; user clicks re-pull them at most this often.
ATS_REFRESH_S = 30 * 60


class FetchBody(BaseModel):
    country: str | None = None


@router.post("/jobs/fetch")
async def fetch_jobs(body: FetchBody | None = None, user: AuthUser = Depends(ai_user)) -> dict:
    db = await get_db()
    profile = await first(
        db.table("profiles").select("parsed_resume, target_roles, target_country, plan, plan_expires_at").eq("user_id", user.id)
    )
    if not profile:
        raise ApiError(404, "Profile not found.")

    explicit = [r.strip() for r in (profile.get("target_roles") or []) if r and r.strip()]
    inferred = (profile.get("parsed_resume") or {}).get("target_role")
    # Every query is ~5 Adzuna requests; cap it so a long target-role list can't drain the quota.
    queries = explicit[:MAX_QUERIES] if explicit else ([inferred] if inferred else [])

    requested = (body.country or "").upper() if body else ""
    country = requested if requested in COUNTRY_NAME else (profile.get("target_country") or DEFAULT_COUNTRY)

    stats = await sync_all_jobs(queries or None, [country], sources=sources_for(effective_plan(profile)),
                                ats_max_age_s=ATS_REFRESH_S)
    return {**stats, "country": country, "queries": queries or ["default"]}


class MatchBody(BaseModel):
    # When the client's "Find jobs" run began. The plan's per-run cap counts from here.
    run_started_at: datetime | None = None


@router.post("/match")
async def match(body: MatchBody | None = None, user: AuthUser = Depends(match_user)) -> dict:
    return await match_jobs_for_user(user.id, run_started_at=body.run_started_at if body else None)


@router.get("/jobs/{job_id}")
async def job_detail(job_id: str, user: AuthUser = Depends(general_user)) -> dict:
    return await get_job(job_id)
