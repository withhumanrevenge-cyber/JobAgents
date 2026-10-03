# backend/app/api/v1/profile.py
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from typing import Optional
from app.core.security import get_current_user
from app.services.supabase_service import supabase_service
from app.services.pdf_service import extract_text_from_pdf, validate_pdf
from app.services.groq_service import groq_service
from app.schemas.user import Profile, ProfileUpdate, ParsedResume
from app.schemas.common import ErrorResponse
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])


RESUME_SYSTEM_PROMPT = """You are an expert resume parser. Extract all relevant information from the resume text below.
Return ONLY a valid JSON object in this exact shape — no markdown, no extra text:
{
  "name": "<full name>",
  "email": "<email address>",
  "phone": "<phone number>",
  "target_role": "<the job title/role this person is targeting, inferred from their most recent title and experience>",
  "years_experience": <integer — total years of professional experience>,
  "summary": "<professional summary or objective, 2-3 sentences>",
  "skills": ["<skill1>", "<skill2>", ...],
  "experience": [
    {
      "company": "<company name>",
      "title": "<job title>",
      "dates": "<start - end dates>",
      "bullets": ["<responsibility or achievement>", ...]
    }
  ],
  "education": [
    {
      "school": "<school name>",
      "degree": "<degree and field>",
      "year": "<graduation year>"
    }
  ],
  "certifications": ["<cert name>", ...],
  "projects": [
    {
      "name": "<project name>",
      "description": "<what it does>",
      "tech": ["<tech used>"],
      "url": "<url if present>"
    }
  ]
}
If a field is not present in the resume, use an empty string or empty array. Do not invent data."""


@router.get("", response_model=Profile)
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get current user's profile"""
    profile = await supabase_service.get_profile(current_user["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return Profile(**profile)


@router.put("", response_model=Profile)
async def update_profile(
    updates: ProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update profile"""
    profile = await supabase_service.upsert_profile({
        "user_id": current_user["user_id"],
        **updates.model_dump(exclude_unset=True)
    })
    if not profile:
        raise HTTPException(status_code=500, detail="Failed to update profile")
    return Profile(**profile)


@router.post("/resume/parse")
async def parse_resume(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Parse resume PDF and extract structured data"""
    user_id = current_user["user_id"]
    
    # Validate file
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    content = await file.read()
    validate_pdf(content)
    
    # Extract text
    resume_text = await extract_text_from_pdf(content)
    if not resume_text or len(resume_text) < 50:
        raise HTTPException(status_code=422, detail="Resume appears to be a scanned image. Please use a text-based PDF.")
    
    # Upload to storage
    file_path = await supabase_service.upload_resume(user_id, content, file.filename or "resume.pdf")
    if not file_path:
        logger.warning("Storage upload failed, continuing without storage")
    
    # Parse with Groq
    try:
        response = await groq_service.call(
            f"Extract all information from this resume:\n\n{resume_text[:6000]}",
            RESUME_SYSTEM_PROMPT,
            meterUserId=user_id
        )
        
        parsed_data = groq_service.parse_json(response)
        if not parsed_data or not parsed_data.get("name"):
            raise HTTPException(status_code=422, detail="Could not parse resume. Please ensure the PDF contains readable text.")
        
        # Update profile
        profile = await supabase_service.upsert_profile({
            "user_id": user_id,
            "parsed_resume": parsed_data,
            "resume_parsed_at": datetime.utcnow().isoformat(),
            "base_resume_url": file_path,
            "full_name": parsed_data.get("name") or profile.get("full_name"),
            "email": parsed_data.get("email") or profile.get("email"),
            "phone": parsed_data.get("phone") or profile.get("phone"),
        })
        
        return {"parsed_resume": parsed_data, "resume_url": file_path}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Resume parse error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse resume")


@router.get("/resume/url")
async def get_resume_url(current_user: dict = Depends(get_current_user)):
    """Get signed URL for user's resume"""
    user_id = current_user["user_id"]
    profile = await supabase_service.get_profile(user_id)
    
    stored = profile.get("base_resume_url") if profile else None
    if not stored:
        raise HTTPException(status_code=404, detail="No resume on file")
    
    url = await supabase_service.create_signed_resume_url(user_id, stored)
    if not url:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    return {"url": url}


from datetime import datetime