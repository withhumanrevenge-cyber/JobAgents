# backend/app/services/billing_service.py
import logging
import httpx
import razorpay
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from app.core.config import settings
from app.services.supabase_service import supabase_service
from app.schemas.common import Plan

logger = logging.getLogger(__name__)

PLAN_CONFIG = {
    "free": {"credits": 15, "match_per_run": 50, "max_visible_matches": 25, "all_sources": False, "all_countries": False, "price_usd": 0},
    "pro": {"credits": 100, "match_per_run": 150, "max_visible_matches": 150, "all_sources": True, "all_countries": True, "price_usd": 12},
    "premium": {"credits": 300, "match_per_run": 300, "max_visible_matches": 2000, "all_sources": True, "all_countries": True, "price_usd": 24},
}

CREDIT_COST = {
    "smart_apply": 3,
    "tailor": 2,
    "interview": 2,
}


def effective_plan(profile: Dict[str, Any]) -> Plan:
    raw = profile.get("plan")
    plan: Plan = "pro" if raw == "pro" else "premium" if raw in ("premium", "lifetime") else "free"
    if plan != "free" and profile.get("plan_expires_at"):
        try:
            expires = datetime.fromisoformat(profile["plan_expires_at"].replace("Z", "+00:00"))
            if expires < datetime.utcnow():
                return "free"
        except:
            pass
    return plan


def plan_config(plan: Plan) -> Dict[str, Any]:
    return PLAN_CONFIG.get(plan, PLAN_CONFIG["free"])


def credit_cost(action: str) -> int:
    return CREDIT_COST.get(action, 0)


async def apply_plan(
    user_id: str,
    plan: Plan,
    provider: str,
    customer_id: Optional[str] = None,
    subscription_id: Optional[str] = None,
    expires_at: Optional[datetime] = None
) -> None:
    await supabase_service.upsert_profile({
        "user_id": user_id,
        "plan": plan,
        "plan_expires_at": expires_at.isoformat() if expires_at else None,
        "billing_provider": provider,
        "billing_customer_id": customer_id,
        "billing_subscription_id": subscription_id,
    })


async def revoke_by_subscription(subscription_id: str) -> None:
    await supabase_service.client.table("profiles").update({
        "plan": "free",
        "plan_expires_at": None
    }).eq("billing_subscription_id", subscription_id).execute()


async def get_credit_state(user_id: str) -> Dict[str, Any]:
    profile = await supabase_service.get_profile(user_id)
    plan = effective_plan(profile or {})
    cfg = plan_config(plan)
    allotment = cfg["credits"]
    used = await supabase_service.get_credits_used_this_month(user_id)
    return {
        "plan": plan,
        "allotment": allotment,
        "used": used,
        "remaining": max(0, allotment - used),
    }


async def gate_action(user_id: str, action: str) -> Dict[str, Any]:
    profile = await supabase_service.get_profile(user_id)
    plan = effective_plan(profile or {})
    cfg = plan_config(plan)
    allotment = cfg["credits"]
    cost = credit_cost(action)

    # Try RPC first
    try:
        success = await supabase_service.consume_credits_rpc(user_id, action, cost, allotment)
        if success:
            return {"allowed": True}
    except Exception as e:
        logger.warning(f"consume_credits RPC failed: {e}")

    # Fallback
    used = await supabase_service.get_credits_used_this_month(user_id)
    if used + cost > allotment:
        msg = (
            "You're out of credits this month. Upgrade to Pro or Premium for more."
            if plan == "free"
            else "You're out of credits this month. They reset next month — or upgrade your plan for more."
        )
        return {"allowed": False, "message": msg}
    
    await supabase_service.log_usage(user_id, action, cost)
    return {"allowed": True}


async def refund_usage(user_id: str, action: str) -> None:
    await supabase_service.refund_last_usage(user_id, action)


# Razorpay
async def create_razorpay_subscription(plan: Plan) -> Dict[str, Any]:
    key_id = settings.RAZORPAY_KEY_ID
    key_secret = settings.RAZORPAY_KEY_SECRET
    
    if not key_id or not key_secret:
        raise ValueError("Razorpay not configured")

    plan_id_map = {
        "pro": settings.RAZORPAY_PRO_PLAN_ID,
        "premium": settings.RAZORPAY_PREMIUM_PLAN_ID,
    }
    plan_id = plan_id_map.get(plan)
    if not plan_id:
        raise ValueError(f"Razorpay {plan} plan not configured")

    client = razorpay.Client(auth=(key_id, key_secret))
    sub = client.subscription.create({
        "plan_id": plan_id,
        "total_count": 12,
        "customer_notify": 1,
    })

    return {
        "provider": "razorpay",
        "type": "subscription",
        "subscription_id": sub["id"],
        "key_id": key_id,
    }


# Lemon Squeezy
async def create_lemonsqueezy_checkout(plan: Plan, user_email: str, user_id: str) -> str:
    api_key = settings.LEMONSQUEEZY_API_KEY
    store_id = settings.LEMONSQUEEZY_STORE_ID
    
    variant_map = {
        "pro": settings.LEMONSQUEEZY_PRO_VARIANT_ID,
        "premium": settings.LEMONSQUEEZY_PREMIUM_VARIANT_ID,
    }
    variant_id = variant_map.get(plan)
    
    if not api_key or not store_id or not variant_id:
        raise ValueError("Lemon Squeezy not configured")

    app_url = settings.NEXT_PUBLIC_APP_URL or "http://localhost:3000"
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.lemonsqueezy.com/v1/checkouts",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
            },
            json={
                "data": {
                    "type": "checkouts",
                    "attributes": {
                        "checkout_data": {
                            "email": user_email,
                            "custom": {"user_id": user_id, "plan": plan},
                        },
                        "product_options": {"redirect_url": f"{app_url}/settings?upgraded=1"},
                    },
                    "relationships": {
                        "store": {"data": {"type": "stores", "id": str(store_id)}},
                        "variant": {"data": {"type": "variants", "id": str(variant_id)}},
                    },
                },
            },
        )
        
        if resp.status_code >= 400:
            logger.error(f"Lemon Squeezy checkout error: {resp.text[:300]}")
            raise ValueError("Could not start checkout")
        
        data = resp.json()
        return data["data"]["attributes"]["url"]


async def handle_razorpay_webhook(event: Dict[str, Any]) -> None:
    event_type = event.get("event", "")
    sub = event.get("payload", {}).get("subscription", {}).get("entity", {})
    user_id = sub.get("notes", {}).get("user_id")
    
    if event_type in ("subscription.activated", "subscription.charged"):
        if user_id:
            plan = "premium" if sub.get("notes", {}).get("plan") == "premium" else "pro"
            expires_at = None
            if sub.get("current_end"):
                expires_at = datetime.fromtimestamp(sub["current_end"])
            await apply_plan(user_id, plan, "razorpay", sub.get("customer_id"), sub.get("id"), expires_at)
    
    elif event_type in ("subscription.cancelled", "subscription.completed", "subscription.halted"):
        if sub.get("id"):
            await revoke_by_subscription(sub["id"])


async def handle_lemonsqueezy_webhook(event: Dict[str, Any]) -> None:
    event_name = event.get("meta", {}).get("event_name", "")
    user_id = event.get("meta", {}).get("custom_data", {}).get("user_id")
    attrs = event.get("data", {}).get("attributes", {})
    variant_id = attrs.get("variant_id") or attrs.get("first_order_item", {}).get("variant_id")
    subscription_id = str(event.get("data", {}).get("id", ""))
    customer_id = str(attrs.get("customer_id", ""))

    variant_map = {
        settings.LEMONSQUEEZY_PRO_VARIANT_ID: "pro",
        settings.LEMONSQUEEZY_PREMIUM_VARIANT_ID: "premium",
    }
    plan = variant_map.get(variant_id, "pro")

    if event_name in ("subscription_created", "subscription_updated", "subscription_payment_success"):
        if user_id:
            expires_at = None
            for field in ("renews_at", "ends_at"):
                if attrs.get(field):
                    try:
                        expires_at = datetime.fromisoformat(attrs[field].replace("Z", "+00:00"))
                        break
                    except:
                        pass
            await apply_plan(user_id, plan, "lemonsqueezy", customer_id, subscription_id, expires_at)
    
    elif event_name in ("subscription_cancelled", "subscription_expired"):
        if subscription_id:
            await revoke_by_subscription(subscription_id)