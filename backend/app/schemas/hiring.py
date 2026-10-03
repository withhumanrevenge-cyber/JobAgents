# backend/app/schemas/hiring.py
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.schemas.common import JobType, ExperienceLevel, PostingStatus, CandidateStatus


class JobPostingBase(BaseModel):
    title: str
    company: str
    location: Optional[str] = None
    job_type: JobType = JobType.ONSITE
    experience_level: ExperienceLevel = ExperienceLevel.MID
    description: str
    skills: List[str] = []
    salary_range: Optional[str] = None
    status: PostingStatus = PostingStatus.OPEN


class JobPostingCreate(JobPostingBase):
    pass


class JobPostingUpdate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[JobType] = None
    experience_level: Optional[ExperienceLevel] = None
    description: Optional[str] = None
    skills: Optional[List[str]] = None
    salary_range: Optional[str] = None
    status: Optional[PostingStatus] = None


class JobPosting(JobPostingBase):
    id: str
    recruiter_id: str
    candidate_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class CandidateProfile(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    linkedin_url: Optional[str] = None
    parsed_resume: Optional[dict] = None


class CandidateMatchBase(BaseModel):
    match_score: int = Field(ge=0, le=100)
    match_reason: Optional[str] = None
    matched_skills: List[str] = []
    missing_skills: List[str] = []
    status: CandidateStatus = CandidateStatus.NEW


class CandidateMatch(CandidateMatchBase):
    id: str
    posting_id: str
    candidate_id: str
    candidate: Optional[CandidateProfile] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MatchCandidatesResponse(BaseModel):
    scored: int