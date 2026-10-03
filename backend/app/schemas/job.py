# backend/app/schemas/job.py
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.schemas.common import JobSource, JobType, ExperienceLevel, JobStatus


class JobBase(BaseModel):
    title: str
    company: str
    location: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    remote: bool = True
    job_type: JobType = JobType.UNKNOWN
    experience_level: ExperienceLevel = ExperienceLevel.MID
    url: str
    description: Optional[str] = None
    salary_range: Optional[str] = None
    tags: List[str] = []
    posted_date: Optional[datetime] = None
    source: JobSource
    source_id: str


class JobCreate(JobBase):
    pass


class Job(JobBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


class MatchBase(BaseModel):
    match_score: int = Field(ge=-1, le=100)
    match_reason: Optional[str] = None
    matched_skills: List[str] = []
    missing_skills: List[str] = []
    status: JobStatus = JobStatus.PENDING


class MatchCreate(MatchBase):
    user_id: str
    job_id: str


class MatchUpdate(BaseModel):
    match_score: Optional[int] = Field(default=None, ge=-1, le=100)
    match_reason: Optional[str] = None
    matched_skills: Optional[List[str]] = None
    missing_skills: Optional[List[str]] = None
    status: Optional[JobStatus] = None
    tailored_resume_json: Optional[dict] = None
    cover_letter: Optional[str] = None
    interview_questions: Optional[List[dict]] = None
    applied_at: Optional[datetime] = None
    notes: Optional[str] = None


class Match(MatchBase):
    id: str
    user_id: str
    job_id: str
    job: Optional[Job] = None
    tailored_resume_url: Optional[str] = None
    tailored_resume_json: Optional[dict] = None
    cover_letter: Optional[str] = None
    cover_letter_generated_at: Optional[datetime] = None
    interview_questions: Optional[List[dict]] = None
    interview_generated_at: Optional[datetime] = None
    applied_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MatchScoreResult(BaseModel):
    score: int = Field(ge=0, le=100)
    reason: str
    matched_skills: List[str]
    missing_skills: List[str]


class JobFetchResult(BaseModel):
    fetched: int
    new: int
    duplicates: int