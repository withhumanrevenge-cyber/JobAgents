# backend/app/api/v1/billing.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import Optional
from pydantic import BaseModel
from app.core.security import get_current_user, verify_webhook_signature
from app.services.billing_service import (
    create_razorpay_subscription,
    create_lemonsqueezy_checkout,
    handle_razorpay_webhook,
    handle_lemonsqueezy_webhook,
    get_credit_state,
)
from app.schemas.billing import (
    CheckoutRequest,
    RazorpayCheckoutResponse,
    LemonSqueezyCheckoutResponse,
    CreditState,
)
from app.schemas.common import Plan, ErrorResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/razorpay/checkout", response_model=RazorpayCheckoutResponse, responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
async def razorpay_checkout(
    request: CheckoutRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create Razorpay subscription checkout"""
    if request.plan not in ("pro", "premium"):
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    try:
        result = await create_razorpay_subscription(request.plan)
        return RazorpayCheckoutResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Razorpay checkout error: {e}")
        raise HTTPException(status_code=500, detail="Checkout failed")


@router.post("/lemonsqueezy/checkout", response_model=LemonSqueezyCheckoutResponse, responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
async def lemonsqueezy_checkout(
    request: CheckoutRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create Lemon Squeezy checkout"""
    if request.plan not in ("pro", "premium"):
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    try:
        url = await create_lemonsqueezy_checkout(request.plan, current_user["email"], current_user["user_id"])
        return LemonSqueezyCheckoutResponse(url=url)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Lemon Squeezy checkout error: {e}")
        raise HTTPException(status_code=500, detail="Checkout failed")


@router.get("/credits", response_model=CreditState)
async def get_credits(current_user: dict = Depends(get_current_user)):
    """Get user's credit state"""
    return await get_credit_state(current_user["user_id"])


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    """Handle Razorpay webhook"""
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret:
        raise HTTPException(status_code=503, detail="Not configured")
    
    raw = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")
    
    if not verify_webhook_signature(raw, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    try:
        import json
        event = json.loads(raw)
        await handle_razorpay_webhook(event)
    except Exception as e:
        logger.error(f"Razorpay webhook handler error: {e}")
        raise HTTPException(status_code=500, detail="Handler error")
    
    return {"ok": True}


@router.post("/webhooks/lemonsqueezy")
async def lemonsqueezy_webhook(request: Request):
    """Handle Lemon Squeezy webhook"""
    secret = settings.LEMONSQUEEZY_WEBHOOK_SECRET
    if not secret:
        raise HTTPException(status_code=503, detail="Not configured")
    
    raw = await request.body()
    signature = request.headers.get("x-signature", "")
    
    if not verify_webhook_signature(raw, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    try:
        import json
        event = json.loads(raw)
        await handle_lemonsqueezy_webhook(event)
    except Exception as e:
        logger.error(f"Lemon Squeezy webhook handler error: {e}")
        raise HTTPException(status_code=500, detail="Handler error")
    
    return {"ok": True}


from app.core.config import settings