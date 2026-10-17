"""Payment-provider webhooks to plan changes.

Webhook events are mapped to a PlanChange by pure functions (unit-tested), then applied."""

import hashlib
import hmac
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from postgrest.exceptions import APIError

from app.config import get_settings
from app.db import first, get_db

log = logging.getLogger(__name__)

Provider = Literal["razorpay", "lemonsqueezy"]


@dataclass
class PlanChange:
    kind: Literal["grant", "revoke", "ignore"]
    subscription_id: str | None = None
    user_id: str | None = None
    plan: str | None = None
    customer_id: str | None = None
    expires_at: str | None = None
    reason: str = ""


def verify_signature(raw: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.encode(), expected.encode())


def _future(iso: str | None) -> bool:
    if not iso:
        return False
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")) > datetime.now(timezone.utc)
    except ValueError:
        return False


# --- Lemon Squeezy ---------------------------------------------------------------------------

def lemon_plan_change(event: dict[str, Any]) -> PlanChange:
    s = get_settings()
    name = (event.get("meta") or {}).get("event_name") or ""
    data = event.get("data") or {}
    attrs = data.get("attributes") or {}
    user_id = ((event.get("meta") or {}).get("custom_data") or {}).get("user_id")

    # Invoice events (subscription_payment_*) carry an invoice, not a subscription: no variant,
    # no renewal date, and data.id is the invoice id. Renewals also send subscription_updated
    # with the new renews_at, which is the event we act on.
    if data.get("type") != "subscriptions":
        return PlanChange("ignore", reason=f"{name}: not a subscription object")

    sub_id = str(data.get("id") or "")
    status = attrs.get("status")
    variant = str(attrs.get("variant_id") or "")
    plan = "pro" if variant and variant == s.LEMONSQUEEZY_PRO_VARIANT_ID else \
        "premium" if variant and variant == s.LEMONSQUEEZY_PREMIUM_VARIANT_ID else None

    if name == "subscription_expired" or status in ("expired", "unpaid", "paused"):
        return PlanChange("revoke", subscription_id=sub_id, reason=f"{name}: status {status}")

    if name not in ("subscription_created", "subscription_updated", "subscription_cancelled",
                    "subscription_resumed", "subscription_unpaused"):
        return PlanChange("ignore", reason=f"{name}: not handled")

    if not plan:
        # A variant we don't sell. Never guess a plan; this needs a config fix, not a retry.
        log.error("Lemon Squeezy event %s for unknown variant %r", name, variant)
        return PlanChange("ignore", reason=f"unknown variant {variant}")

    # Cancelled subscriptions stay paid until ends_at.
    expires = attrs.get("ends_at") if status == "cancelled" else attrs.get("renews_at") or attrs.get("ends_at")
    if status == "cancelled" and not _future(expires):
        return PlanChange("revoke", subscription_id=sub_id, reason="cancelled and past ends_at")

    return PlanChange(
        "grant", subscription_id=sub_id, user_id=user_id, plan=plan,
        customer_id=str(attrs.get("customer_id") or "") or None, expires_at=expires,
    )


# --- Razorpay --------------------------------------------------------------------------------

def razorpay_plan_change(event: dict[str, Any]) -> PlanChange:
    s = get_settings()
    name = event.get("event") or ""
    sub = (((event.get("payload") or {}).get("subscription") or {}).get("entity")) or {}
    if not sub:
        return PlanChange("ignore", reason=f"{name}: no subscription entity")

    sub_id = sub.get("id")
    notes = sub.get("notes") or {}
    plan_id = sub.get("plan_id")
    plan = "pro" if plan_id and plan_id == s.RAZORPAY_PRO_PLAN_ID else \
        "premium" if plan_id and plan_id == s.RAZORPAY_PREMIUM_PLAN_ID else \
        notes.get("plan") if notes.get("plan") in ("pro", "premium") else None
    current_end = sub.get("current_end")
    expires = datetime.fromtimestamp(current_end, tz=timezone.utc).isoformat() if current_end else None

    if name in ("subscription.completed", "subscription.halted", "subscription.paused"):
        return PlanChange("revoke", subscription_id=sub_id, reason=name)

    if name == "subscription.cancelled":
        # Cancelled at cycle end: keep access until the paid period ends.
        if _future(expires) and plan:
            return PlanChange("grant", subscription_id=sub_id, user_id=notes.get("user_id"), plan=plan,
                              customer_id=sub.get("customer_id"), expires_at=expires)
        return PlanChange("revoke", subscription_id=sub_id, reason=name)

    if name in ("subscription.activated", "subscription.charged", "subscription.resumed"):
        if not plan:
            log.error("Razorpay event %s for unknown plan %r", name, plan_id)
            return PlanChange("ignore", reason=f"unknown plan {plan_id}")
        return PlanChange("grant", subscription_id=sub_id, user_id=notes.get("user_id"), plan=plan,
                          customer_id=sub.get("customer_id"), expires_at=expires)

    return PlanChange("ignore", reason=f"{name}: not handled")


# --- Applying --------------------------------------------------------------------------------

async def apply_change(provider: Provider, change: PlanChange) -> None:
    db = await get_db()
    if change.kind == "revoke":
        if change.subscription_id:
            await db.table("profiles").update({"plan": "free", "plan_expires_at": None}) \
                .eq("billing_subscription_id", change.subscription_id).execute()
        return
    if change.kind != "grant":
        log.info("%s webhook ignored: %s", provider, change.reason)
        return

    user_id = change.user_id
    if not user_id and change.subscription_id:
        row = await first(db.table("profiles").select("user_id").eq("billing_subscription_id", change.subscription_id))
        user_id = row["user_id"] if row else None
    if not user_id:
        log.error("%s webhook: can't tell which user subscription %s belongs to", provider, change.subscription_id)
        return

    await db.table("profiles").update({
        "plan": change.plan,
        "plan_expires_at": change.expires_at,
        "billing_provider": provider,
        "billing_customer_id": change.customer_id,
        "billing_subscription_id": change.subscription_id,
    }).eq("user_id", user_id).execute()


async def claim_event(provider: Provider, event_id: str, event_type: str, payload: dict[str, Any]) -> bool:
    """Claim before handling: unique(provider, event_id) lets exactly one of two concurrent
    deliveries through. False means already processed (or in flight)."""
    db = await get_db()
    try:
        await db.table("webhook_events").insert(
            {"provider": provider, "event_id": event_id, "event_type": event_type, "payload": payload}
        ).execute()
        return True
    except APIError as e:
        if e.code == "23505":
            return False
        raise


async def release_event(provider: Provider, event_id: str) -> None:
    """Undo a claim when handling failed, so the provider's retry is processed, not dropped."""
    db = await get_db()
    try:
        await db.table("webhook_events").delete().eq("provider", provider).eq("event_id", event_id).execute()
    except Exception:
        log.exception("webhook_events release failed")
