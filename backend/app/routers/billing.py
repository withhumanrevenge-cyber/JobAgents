import hashlib
import json
import logging
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from app.auth import AuthUser
from app.config import get_settings
from app.errors import ApiError
from app.plans import CREDIT_COST, PLAN_CONFIG, price_label
from app.ratelimit import general_user
from app.services import billing
from app.services.ai import decide_mode, get_key_row
from app.services.usage import get_credit_state

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["billing"])


@router.get("/usage/me")
async def usage_me(
    currency: Literal["USD", "INR"] = Query("USD"), user: AuthUser = Depends(general_user)
) -> dict:
    s = get_settings()
    state = await get_credit_state(user.id)
    mode = decide_mode(state.plan, await get_key_row(user.id))
    return {
        "plan": state.plan,
        # byok: the user's own key, no credits spent. hosted/trial: our key, credits below apply.
        "ai_mode": mode,
        "credits": {"allotment": state.allotment, "used": state.used, "remaining": state.remaining},
        "costs": CREDIT_COST,
        "maxVisibleMatches": PLAN_CONFIG[state.plan]["maxVisibleMatches"],
        "prices": {"pro": price_label("pro", currency), "premium": price_label("premium", currency)},
        "processors": {"razorpay": bool(s.RAZORPAY_KEY_ID), "lemonsqueezy": bool(s.LEMONSQUEEZY_API_KEY)},
    }


class CheckoutBody(BaseModel):
    plan: Literal["pro", "premium"]


@router.post("/billing/lemonsqueezy/checkout")
async def lemon_checkout(body: CheckoutBody, user: AuthUser = Depends(general_user)) -> dict:
    s = get_settings()
    variant = s.LEMONSQUEEZY_PRO_VARIANT_ID if body.plan == "pro" else s.LEMONSQUEEZY_PREMIUM_VARIANT_ID
    if not (s.LEMONSQUEEZY_API_KEY and s.LEMONSQUEEZY_STORE_ID and variant):
        raise ApiError(503, "Lemon Squeezy is not configured.")

    payload = {"data": {
        "type": "checkouts",
        "attributes": {
            "checkout_data": {"email": user.email, "custom": {"user_id": user.id, "plan": body.plan}},
            "product_options": {"redirect_url": f"{s.APP_URL}/settings?upgraded=1"},
        },
        "relationships": {
            "store": {"data": {"type": "stores", "id": str(s.LEMONSQUEEZY_STORE_ID)}},
            "variant": {"data": {"type": "variants", "id": str(variant)}},
        },
    }}
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(
            "https://api.lemonsqueezy.com/v1/checkouts",
            headers={
                "Authorization": f"Bearer {s.LEMONSQUEEZY_API_KEY}",
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
            },
            json=payload,
        )
    if res.status_code >= 300:
        log.error("Lemon Squeezy checkout error %s: %s", res.status_code, res.text[:300])
        raise ApiError(502, "Could not start checkout.")
    url = ((res.json().get("data") or {}).get("attributes") or {}).get("url")
    if not url:
        raise ApiError(502, "Could not start checkout.")
    return {"url": url}


@router.post("/billing/razorpay/checkout")
async def razorpay_checkout(body: CheckoutBody, user: AuthUser = Depends(general_user)) -> dict:
    s = get_settings()
    if not (s.RAZORPAY_KEY_ID and s.RAZORPAY_KEY_SECRET):
        raise ApiError(503, "Razorpay is not configured.")
    plan_id = s.RAZORPAY_PRO_PLAN_ID if body.plan == "pro" else s.RAZORPAY_PREMIUM_PLAN_ID
    if not plan_id:
        raise ApiError(503, f"Razorpay {body.plan} plan not configured.")

    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(
            "https://api.razorpay.com/v1/subscriptions",
            auth=(s.RAZORPAY_KEY_ID, s.RAZORPAY_KEY_SECRET),
            # notes.user_id is how the webhook finds the user to upgrade.
            json={"plan_id": plan_id, "total_count": 12, "customer_notify": 1,
                  "notes": {"user_id": user.id, "plan": body.plan}},
        )
    if res.status_code >= 300:
        log.error("Razorpay checkout error %s: %s", res.status_code, res.text[:300])
        raise ApiError(502, "Could not start checkout.")
    return {"provider": "razorpay", "type": "subscription", "subscription_id": res.json()["id"], "key_id": s.RAZORPAY_KEY_ID}


async def _handle_webhook(provider: billing.Provider, raw: bytes, event_id: str, event_type: str, change: billing.PlanChange) -> dict:
    if not await billing.claim_event(provider, event_id, event_type, json.loads(raw)):
        return {"ok": True, "duplicate": True}
    try:
        await billing.apply_change(provider, change)
    except Exception:
        log.exception("%s webhook handler failed", provider)
        await billing.release_event(provider, event_id)
        raise ApiError(500, "Handler error") from None  # non-2xx: the provider retries
    return {"ok": True}


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request) -> dict:
    secret = get_settings().RAZORPAY_WEBHOOK_SECRET
    if not secret:
        raise ApiError(503, "Not configured")
    raw = await request.body()
    if not billing.verify_signature(raw, request.headers.get("x-razorpay-signature", ""), secret):
        raise ApiError(401, "Invalid signature")
    event = json.loads(raw)
    # Razorpay puts the unique event id in a header; the body has none.
    event_id = request.headers.get("x-razorpay-event-id") or hashlib.sha256(raw).hexdigest()
    return await _handle_webhook("razorpay", raw, event_id, event.get("event", ""), billing.razorpay_plan_change(event))


@router.post("/webhooks/lemonsqueezy")
async def lemonsqueezy_webhook(request: Request) -> dict:
    secret = get_settings().LEMONSQUEEZY_WEBHOOK_SECRET
    if not secret:
        raise ApiError(503, "Not configured")
    raw = await request.body()
    if not billing.verify_signature(raw, request.headers.get("x-signature", ""), secret):
        raise ApiError(401, "Invalid signature")
    event = json.loads(raw)
    # No per-event id from Lemon Squeezy, and data.id is shared by every event on a
    # subscription. Retries resend the identical body, so its hash identifies a delivery.
    event_id = hashlib.sha256(raw).hexdigest()
    event_type = (event.get("meta") or {}).get("event_name", "")
    return await _handle_webhook("lemonsqueezy", raw, event_id, event_type, billing.lemon_plan_change(event))
