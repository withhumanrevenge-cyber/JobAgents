# backend/app/api/v1/interview.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from pydantic import BaseModel
from app.core.security import get_current_user
from app.services.supabase_service import supabase_service
from app.agents.interview_agent import generate_interview_questions
from app.services.billing_service import gate_action, refund_usage
from app.schemas.common import ErrorResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interview", tags=["interview"])


class InterviewRequest(BaseModel):
    match_id: Optional[str] = None
    job_id: Optional[str] = None


class InterviewResponse(BaseModel):
    questions: list


@router.post("/generate", response_model=InterviewResponse, responses={402: {"model": ErrorResponse}})
async def generate_interview(
    request: InterviewRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate interview questions for a job"""
    user_id = current_user["user_id"]
    
    if not request.match_id and not request.job_id:
        raise HTTPException(status_code=400, detail="match_id or job_id is required")
    
    # Get job
    job_id = request.job_id
    if request.match_id and not job_id:
        match = await supabase_service.client.table("matches").select("job_id").eq("id", request.match_id).eq("user_id", user_id).single().execute()
        if match.data:
            job_id = match.data["job_id"]
    
    if not job_id:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = await supabase_service.get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check credits
    gate = await gate_action(user_id, "interview")
    if not gate["allowed"]:
        raise HTTPException(status_code=402, detail=gate.get("message", "Insufficient credits"))
    
    try:
        profile = await supabase_service.get_profile(user_id)
        parsed_resume = profile.get("parsed_resume") if profile else None
        
        questions = await generate_interview_questions(
            job.get("title", ""),
            job.get("company", ""),
            job.get("description", "") or "",
            parsed_resume,
            user_id
        )
        
        # Save to match if applicable
        if request.match_id and not request.match_id.startswith("pending-"):
            await supabase_service.update_match(user_id, job_id, {
                "interview_questions": questions,
                "interview_generated_at": datetime.utcnow().isoformat()
            })
        
        return InterviewResponse(questions=questions)
        
    except Exception as e:
        await refund_usage(user_id, "interview")
        logger.error(f"Interview generation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate interview questions")


from datetime import datetime