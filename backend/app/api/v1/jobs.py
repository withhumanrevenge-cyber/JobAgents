# backend/app/api/v1/jobs.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional, List
from app.core.security import get_current_user
from app.services.supabase_service import supabase_service
from app.agents.job_fetcher import sync_all_jobs
from app.agents.matching_agent import match_jobs_for_user
from app.schemas.job import Job, JobFetchResult, Match
from app.schemas.common import ErrorResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/fetch", response_model=JobFetchResult)
async def fetch_jobs(
    country: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Fetch and sync jobs based on user's preferences"""
    user_id = current_user["user_id"]
    profile = await supabase_service.get_profile(user_id)
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Determine queries
    explicit = [t for t in (profile.get("target_roles") or []) if t]
    inferred = profile.get("parsed_resume", {}).get("target_role")
    queries = explicit if explicit else ([inferred] if inferred else None)
    
    # Determine country
    target_country = country or profile.get("target_country")
    
    # Determine sources based on plan
    from app.services.billing_service import effective_plan, plan_config
    plan = effective_plan(profile)
    cfg = plan_config(plan)
    sources = ["adzuna", "greenhouse", "lever", "ashby"] if cfg["all_sources"] else ["adzuna"]
    
    stats = await sync_all_jobs(queries, target_country, sources)
    return JobFetchResult(**stats)


@router.post("/match")
async def match_jobs(
    limit: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Score unscored jobs against user's resume"""
    user_id = current_user["user_id"]
    
    try:
        result = await match_jobs_for_user(user_id, limit)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Job matching error: {e}")
        raise HTTPException(status_code=500, detail="Failed to score jobs")


@router.get("", response_model=List[Match])
async def get_jobs(
    min_score: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = Query(20, le=100),
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Get user's matched jobs"""
    user_id = current_user["user_id"]
    profile = await supabase_service.get_profile(user_id)
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    matches = await supabase_service.get_user_matches(
        user_id,
        min_score=min_score,
        limit=limit
    )
    
    # Apply pagination
    matches = matches[offset:offset+limit]
    return [Match(**m) for m in matches]


@router.get("/{job_id}", response_model=Match)
async def get_job_detail(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed job match"""
    user_id = current_user["user_id"]
    
    match = await supabase_service.client.table("matches").select("*, job:jobs(*)").eq("user_id", user_id).eq("job_id", job_id).single().execute()
    
    if not match.data:
        # Check if job exists but not matched
        job = await supabase_service.get_job_by_id(job_id)
        if job:
            return Match(
                id=f"pending-{job_id}",
                user_id=user_id,
                job_id=job_id,
                job=job,
                match_score=-1,
                match_reason=None,
                matched_skills=[],
                missing_skills=[],
                status="pending",
                tailored_resume_url=None,
                tailored_resume_json=None,
                cover_letter=None,
                interview_questions=None,
                applied_at=None,
                notes=None,
                created_at=job.get("created_at"),
            )
        raise HTTPException(status_code=404, detail="Job not found")
    
    return Match(**match.data)


@router.post("/{job_id}/apply")
async def mark_applied(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark job as applied"""
    user_id = current_user["user_id"]
    
    # Check if match exists
    match = await supabase_service.client.table("matches").select("*").eq("user_id", user_id).eq("job_id", job_id).single().execute()
    
    if match.data:
        await supabase_service.update_match(user_id, job_id, {
            "status": "applied",
            "applied_at": datetime.utcnow().isoformat()
        })
    else:
        # Create new match with applied status
        await supabase_service.insert_match({
            "user_id": user_id,
            "job_id": job_id,
            "match_score": -1,
            "match_reason": "Manually tracked — not scored by AI.",
            "matched_skills": [],
            "missing_skills": [],
            "status": "applied",
            "applied_at": datetime.utcnow().isoformat(),
        })
    
    return {"success": True}


from datetime import datetime