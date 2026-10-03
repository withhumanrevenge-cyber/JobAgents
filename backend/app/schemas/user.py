# backend/app/schemas/user.py
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.schemas.common import Plan, AccountType


class ParsedResume(BaseModel):
    name: str
    email: str
    phone: str
    target_role: str
    years_experience: int
    skills: List[str]
    summary: str
    experience: List[Dict[str, Any]]
    education: List[Dict[str, Any]]
    certifications: Optional[List[str]] = []
    projects: Optional[List[Dict[str, Any]]] = []


class InterviewQuestion(BaseModel):
    question: str
    category: str
    tip: str


class ResumeData(BaseModel):
    name: str
    email: str
    phone: str
    summary: str
    skills: List[str]
    ats_score: Optional[int] = None
    experience: List[Dict[str, Any]]
    education: List[Dict[str, Any]]
    projects: List[Dict[str, Any]]


class ProfileBase(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    github_username: Optional[str] = None
    linkedin_url: Optional[str] = None
    match_threshold: int = Field(default=70, ge=0, le=100)
    auto_apply: bool = False
    target_roles: List[str] = []
    target_country: Optional[str] = None
    email_notifications: bool = True
    open_to_work: bool = False
    company_name: Optional[str] = None


class ProfileCreate(ProfileBase):
    user_id: str
    account_type: AccountType = AccountType.SEEKER


class ProfileUpdate(ProfileBase):
    pass


class Profile(ProfileBase):
    id: str
    user_id: str
    base_resume_url: Optional[str] = None
    parsed_resume: Optional[ParsedResume] = None
    resume_parsed_at: Optional[datetime] = None
    onboarded: bool = False
    plan: Plan = Plan.FREE
    plan_expires_at: Optional[datetime] = None
    is_admin: bool = False
    billing_provider: Optional[str] = None
    billing_customer_id: Optional[str] = None
    billing_subscription_id: Optional[str] = None
    account_type: AccountType = AccountType.SEEKER
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True