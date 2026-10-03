# backend/app/schemas/common.py
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Literal, Dict, Any
from datetime import datetime
from enum import Enum


class Plan(str, Enum):
    FREE = "free"
    PRO = "pro"
    PREMIUM = "premium"


class UsageAction(str, Enum):
    SMART_APPLY = "smart_apply"
    TAILOR = "tailor"
    INTERVIEW = "interview"


class JobStatus(str, Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"
    APPLIED = "applied"
    SKIPPED = "skipped"
    INTERVIEW = "interview"
    REJECTED = "rejected"
    OFFER = "offer"


class JobSource(str, Enum):
    ADZUNA = "adzuna"
    GREENHOUSE = "greenhouse"
    LEVER = "lever"
    ASHBY = "ashby"


class JobType(str, Enum):
    REMOTE = "remote"
    HYBRID = "hybrid"
    ONSITE = "onsite"
    UNKNOWN = "unknown"


class ExperienceLevel(str, Enum):
    ENTRY = "entry"
    MID = "mid"
    SENIOR = "senior"
    LEAD = "lead"
    UNKNOWN = "unknown"


class AccountType(str, Enum):
    SEEKER = "seeker"
    RECRUITER = "recruiter"


class PostingStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class CandidateStatus(str, Enum):
    NEW = "new"
    SHORTLISTED = "shortlisted"
    CONTACTED = "contacted"
    REJECTED = "rejected"


# Base schemas
class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


class SuccessResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    total_pages: int