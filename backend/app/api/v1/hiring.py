# backend/app/api/v1/hiring.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional, List
from pydantic import BaseModel
from app.core.security import get_current_user
from app.services.supabase_service import supabase_service
from app.agents.candidate_agent import match_candidates_for_posting
from app.schemas.hiring import JobPosting, JobPostingCreate, JobPostingUpdate, CandidateMatch
from app.schemas.common import ErrorResponse, JobType, ExperienceLevel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hire", tags=["hiring"])


@router.get("", response_model=List[JobPosting])
async def get_postings(current_user: dict = Depends(get_current_user)):
    """Get recruiter's job postings"""
    return await supabase_service.get_job_postings(current_user["user_id"])


@router.post("", response_model=JobPosting, responses={400: {"model": ErrorResponse}})
async def create_posting(
    posting: JobPostingCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new job posting"""
    user_id = current_user["user_id"]
    
    posting_data = posting.model_dump()
    posting_data["recruiter_id"] = user_id
    
    created = await supabase_service.create_job_posting(posting_data)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create posting")
    
    # Update user to recruiter
    await supabase_service.upsert_profile({
        "user_id": user_id,
        "account_type": "recruiter"
    })
    
    created["candidate_count"] = 0
    return JobPosting(**created)


@router.get("/{posting_id}", response_model=JobPosting)
async def get_posting(
    posting_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get job posting detail"""
    posting = await supabase_service.get_job_posting(posting_id)
    if not posting:
        raise HTTPException(status_code=404, detail="Not found")
    
    if posting["recruiter_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    return JobPosting(**posting)


@router.put("/{posting_id}", response_model=JobPosting)
async def update_posting(
    posting_id: str,
    updates: JobPostingUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update job posting"""
    posting = await supabase_service.get_job_posting(posting_id)
    if not posting:
        raise HTTPException(status_code=404, detail="Not found")
    
    if posting["recruiter_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # Update in database
    result = supabase_service.client.table("job_postings").update(
        updates.model_dump(exclude_unset=True)
    ).eq("id", posting_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update")
    
    return JobPosting(**result.data[0])


@router.post("/{posting_id}/match-candidates")
async def match_candidates(
    posting_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Score candidates against this posting"""
    posting = await supabase_service.get_job_posting(posting_id)
    if not posting:
        raise HTTPException(status_code=404, detail="Not found")
    
    if posting["recruiter_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        result = await match_candidates_for_posting(posting_id)
        return result
    except Exception as e:
        logger.error(f"Candidate matching error: {e}")
        raise HTTPException(status_code=500, detail="Failed to score candidates")


@router.get("/{posting_id}/candidates", response_model=List[CandidateMatch])
async def get_candidates(
    posting_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get matched candidates for a posting"""
    posting = await supabase_service.get_job_posting(posting_id)
    if not posting:
        raise HTTPException(status_code=404, detail="Not found")
    
    if posting["recruiter_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    candidates = await supabase_service.get_candidates_for_posting(posting_id)
    return [CandidateMatch(**c) for c in candidates]


@router.get("/{posting_id}/candidates/{candidate_id}")
async def get_candidate_detail(
    posting_id: str,
    candidate_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed candidate profile"""
    posting = await supabase_service.get_job_posting(posting_id)
    if not posting:
        raise HTTPException(status_code=404, detail="Not found")
    
    if posting["recruiter_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # Get match
    match_result = supabase_service.client.table("candidate_matches").select("*").eq("posting_id", posting_id).eq("candidate_id", candidate_id).single().execute()
    
    if not match_result.data:
        raise HTTPException(status_code=404, detail="Candidate not found for this posting")
    
    # Get candidate profile
    profiles = await supabase_service.get_profiles_for_candidates([candidate_id])
    candidate_profile = profiles.get(candidate_id)
    
    return {
        "match": match_result.data,
        "candidate": candidate_profile
    }