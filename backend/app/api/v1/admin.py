# backend/app/api/v1/admin.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional, List
from pydantic import BaseModel
from app.core.security import get_current_user
from app.services.supabase_service import supabase_service
from app.services.billing_service import apply_plan
from app.schemas.billing import AdminSetPlanRequest, AdminGrantCreditsRequest
from app.schemas.common import Plan, ErrorResponse
from app.core.config import settings
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


async def get_admin_user(current_user: dict = Depends(get_current_user)):
    """Verify user is admin"""
    email = current_user.get("email", "").lower()
    admin_emails = [e.lower() for e in settings.ADMIN_EMAILS]
    
    if email not in admin_emails:
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required")
    
    # Also check DB flag
    profile = await supabase_service.get_profile(current_user["user_id"])
    if not profile or not profile.get("is_admin"):
        raise HTTPException(status_code=403, detail="Forbidden: Admin flag not set")
    
    return current_user


class OverviewResponse(BaseModel):
    total_users: int
    by_plan: dict
    active_users: int
    new_this_week: int
    tokens_this_month: int
    credits_this_month: int
    smart_applies_this_month: int
    mrr: float


class AdminUserRow(BaseModel):
    user_id: str
    email: Optional[str]
    full_name: Optional[str]
    plan: str
    plan_expires_at: Optional[str]
    is_admin: bool
    created_at: Optional[str]
    smart_apply: int
    tailor: int
    interview: int
    credits: int
    tokens: int


@router.get("/overview", response_model=OverviewResponse)
async def admin_overview(admin: dict = Depends(get_admin_user)):
    """Get admin dashboard overview"""
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_ago = datetime.utcnow() - timedelta(days=7)
    
    # Get all profiles
    profiles = await supabase_service.get_all_profiles(limit=5000)
    all_profiles = profiles or []
    
    by_plan = {"free": 0, "pro": 0, "premium": 0}
    for p in all_profiles:
        plan = p.get("plan", "free")
        if plan == "pro":
            by_plan["pro"] += 1
        elif plan in ("premium", "lifetime"):
            by_plan["premium"] += 1
        else:
            by_plan["free"] += 1
    
    # Get usage events this month
    usage = await supabase_service.get_usage_events_since(month_start)
    
    tokens_this_month = sum(e.get("tokens", 0) for e in usage)
    credits_this_month = sum(e.get("credits", 0) for e in usage)
    active_users = len(set(e.get("user_id") for e in usage))
    smart_applies = sum(1 for e in usage if e.get("action") == "smart_apply")
    
    new_this_week = sum(1 for p in all_profiles 
        if p.get("created_at") and datetime.fromisoformat(p["created_at"].replace("Z", "+00:00")) >= week_ago)
    
    mrr = by_plan["pro"] * 12 + by_plan["premium"] * 24
    
    return OverviewResponse(
        total_users=len(all_profiles),
        by_plan=by_plan,
        active_users=active_users,
        new_this_week=new_this_week,
        tokens_this_month=tokens_this_month,
        credits_this_month=credits_this_month,
        smart_applies_this_month=smart_applies,
        mrr=mrr,
    )


@router.get("/users", response_model=List[AdminUserRow])
async def admin_users(admin: dict = Depends(get_admin_user)):
    """Get all users with usage stats"""
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    profiles = await supabase_service.get_all_profiles(limit=5000)
    all_profiles = profiles or []
    
    usage = await supabase_service.get_usage_events_since(month_start)
    
    buckets = {}
    for e in usage:
        uid = e.get("user_id")
        if uid not in buckets:
            buckets[uid] = {"smart_apply": 0, "tailor": 0, "interview": 0, "credits": 0, "tokens": 0}
        action = e.get("action")
        if action == "smart_apply":
            buckets[uid]["smart_apply"] += 1
        elif action == "tailor":
            buckets[uid]["tailor"] += 1
        elif action == "interview":
            buckets[uid]["interview"] += 1
        buckets[uid]["credits"] += e.get("credits", 0)
        buckets[uid]["tokens"] += e.get("tokens", 0)
    
    rows = []
    for p in all_profiles:
        uid = p["user_id"]
        b = buckets.get(uid, {"smart_apply": 0, "tailor": 0, "interview": 0, "credits": 0, "tokens": 0})
        rows.append(AdminUserRow(
            user_id=uid,
            email=p.get("email"),
            full_name=p.get("full_name"),
            plan=p.get("plan", "free"),
            plan_expires_at=p.get("plan_expires_at"),
            is_admin=p.get("is_admin", False),
            created_at=p.get("created_at"),
            **b
        ))
    
    return rows


@router.post("/set-plan")
async def admin_set_plan(
    request: AdminSetPlanRequest,
    admin: dict = Depends(get_admin_user)
):
    """Manually set user's plan"""
    valid_plans = ["free", "pro", "premium"]
    if request.plan not in valid_plans:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    expires_at = None if request.plan == "free" else datetime.utcnow() + timedelta(days=30)
    
    await apply_plan(
        user_id=request.user_id,
        plan=request.plan,
        provider="admin",
        expires_at=expires_at
    )
    
    return {"ok": True, "plan": request.plan, "plan_expires_at": expires_at.isoformat() if expires_at else None}


@router.post("/grant-credits")
async def admin_grant_credits(
    request: AdminGrantCreditsRequest,
    admin: dict = Depends(get_admin_user)
):
    """Grant bonus credits to user"""
    from app.services.supabase_service import supabase_service as svc
    
    # Add a usage event with negative credits (refund)
    await svc.log_usage(
        user_id=request.user_id,
        action="admin_grant",
        credits=-request.amount,  # Negative credits = grant
        tokens=0,
        model=None
    )
    
    return {"ok": True, "granted": request.amount}