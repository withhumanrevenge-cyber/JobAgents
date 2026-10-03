# backend/app/api/v1/apply.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from pydantic import BaseModel
from app.core.security import get_current_user
from app.services.supabase_service import supabase_service
from app.agents.resume_agent import generate_tailored_resume
from app.agents.cover_letter_agent import generate_cover_letter
from app.services.billing_service import gate_action, refund_usage
from app.schemas.common import ErrorResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/apply", tags=["apply"])


class SmartApplyRequest(BaseModel):
    job_id: str


class SmartApplyResponse(BaseModel):
    apply_url: str
    tailored_resume: dict
    cover_letter: str


@router.post("/smart", response_model=SmartApplyResponse, responses={402: {"model": ErrorResponse}})
async def smart_apply(
    request: SmartApplyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate tailored resume and cover letter in one call"""
    user_id = current_user["user_id"]
    job_id = request.job_id
    
    # Check job exists
    job = await supabase_service.get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check credits
    gate = await gate_action(user_id, "smart_apply")
    if not gate["allowed"]:
        raise HTTPException(status_code=402, detail=gate.get("message", "Insufficient credits"))
    
    try:
        # Generate tailored resume
        tailored_resume = await generate_tailored_resume(user_id, job_id)
        
        # Get parsed resume
        profile = await supabase_service.get_profile(user_id)
        parsed_resume = profile.get("parsed_resume") if profile else None
        
        # Generate cover letter
        cover_letter = await generate_cover_letter(job, parsed_resume, tailored_resume, user_id)
        
        # Save cover letter to match
        await supabase_service.update_match(user_id, job_id, {
            "cover_letter": cover_letter,
            "cover_letter_generated_at": datetime.utcnow().isoformat()
        })
        
        return SmartApplyResponse(
            apply_url=job.get("url", ""),
            tailored_resume=tailored_resume,
            cover_letter=cover_letter
        )
        
    except Exception as e:
        await refund_usage(user_id, "smart_apply")
        logger.error(f"Smart apply error: {e}")
        raise HTTPException(status_code=500, detail="Smart apply failed")


@router.post("/resume/tailor")
async def tailor_resume(
    request: SmartApplyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate tailored resume only"""
    user_id = current_user["user_id"]
    job_id = request.job_id
    
    gate = await gate_action(user_id, "tailor")
    if not gate["allowed"]:
        raise HTTPException(status_code=402, detail=gate.get("message", "Insufficient credits"))
    
    try:
        resume = await generate_tailored_resume(user_id, job_id)
        return {"resume_json": resume}
    except Exception as e:
        await refund_usage(user_id, "tailor")
        logger.error(f"Tailor resume error: {e}")
        raise HTTPException(status_code=500, detail="Failed to tailor resume")


from datetime import datetime