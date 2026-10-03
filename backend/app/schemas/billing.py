# backend/app/schemas/billing.py
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from app.schemas.common import Plan


class BillingConfig(BaseModel):
    pro_usd: int
    premium_usd: int
    pro_inr_paise: int
    premium_inr_paise: int


class CheckoutRequest(BaseModel):
    plan: Plan


class RazorpayCheckoutResponse(BaseModel):
    provider: Literal["razorpay"] = "razorpay"
    type: Literal["subscription"] = "subscription"
    subscription_id: str
    key_id: str


class LemonSqueezyCheckoutResponse(BaseModel):
    url: str


class WebhookEvent(BaseModel):
    provider: str
    event_id: str
    event_type: str
    payload: dict


class ApplyPlanRequest(BaseModel):
    user_id: str
    plan: Plan
    provider: Literal["razorpay", "lemonsqueezy"]
    customer_id: Optional[str] = None
    subscription_id: Optional[str] = None
    expires_at: Optional[datetime] = None


class CreditState(BaseModel):
    plan: Plan
    allotment: int
    used: int
    remaining: int


class UsageEvent(BaseModel):
    user_id: str
    action: str
    credits: int = 0
    tokens: int = 0
    model: Optional[str] = None


class AdminGrantCreditsRequest(BaseModel):
    user_id: str
    amount: int = Field(gt=0)


class AdminSetPlanRequest(BaseModel):
    user_id: str
    plan: Plan