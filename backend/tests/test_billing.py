from datetime import datetime, timedelta, timezone

from app.plans import effective_plan
from app.services.billing import lemon_plan_change, razorpay_plan_change, verify_signature

FUTURE = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
PAST = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()


def lemon(event_name, status="active", variant=222, data_type="subscriptions", **attrs):
    return {
        "meta": {"event_name": event_name, "custom_data": {"user_id": "u1"}},
        "data": {"type": data_type, "id": "sub_1",
                 "attributes": {"status": status, "variant_id": variant, "customer_id": 9, "renews_at": FUTURE, **attrs}},
    }


def test_lemon_created_grants_variant_plan():
    c = lemon_plan_change(lemon("subscription_created"))
    assert (c.kind, c.plan, c.user_id, c.subscription_id, c.expires_at) == ("grant", "premium", "u1", "sub_1", FUTURE)


def test_lemon_payment_success_is_ignored():
    # Invoice payload: data.id is the invoice id and there's no variant. Acting on it used to
    # downgrade premium to pro, clear the expiry, and overwrite the subscription id.
    event = {"meta": {"event_name": "subscription_payment_success", "custom_data": {"user_id": "u1"}},
             "data": {"type": "subscription-invoices", "id": "inv_9", "attributes": {"subscription_id": "sub_1"}}}
    assert lemon_plan_change(event).kind == "ignore"


def test_lemon_unknown_variant_never_defaults_to_pro():
    assert lemon_plan_change(lemon("subscription_updated", variant=999)).kind == "ignore"


def test_lemon_cancelled_keeps_access_until_ends_at():
    c = lemon_plan_change(lemon("subscription_cancelled", status="cancelled", ends_at=FUTURE))
    assert c.kind == "grant" and c.expires_at == FUTURE


def test_lemon_cancelled_past_end_revokes():
    assert lemon_plan_change(lemon("subscription_cancelled", status="cancelled", ends_at=PAST)).kind == "revoke"


def test_lemon_expired_and_unpaid_revoke():
    assert lemon_plan_change(lemon("subscription_expired", status="expired")).kind == "revoke"
    assert lemon_plan_change(lemon("subscription_updated", status="unpaid")).kind == "revoke"


def rzp(event, plan_id="plan_pro", current_end=None):
    end = current_end if current_end is not None else int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    return {"event": event, "payload": {"subscription": {"entity": {
        "id": "sub_r", "plan_id": plan_id, "customer_id": "cust", "current_end": end, "notes": {"user_id": "u2"}}}}}


def test_razorpay_charged_grants_plan_from_plan_id():
    c = razorpay_plan_change(rzp("subscription.charged", plan_id="plan_premium"))
    assert (c.kind, c.plan, c.user_id) == ("grant", "premium", "u2")


def test_razorpay_cancel_at_cycle_end_keeps_access():
    assert razorpay_plan_change(rzp("subscription.cancelled")).kind == "grant"
    past = int((datetime.now(timezone.utc) - timedelta(days=1)).timestamp())
    assert razorpay_plan_change(rzp("subscription.cancelled", current_end=past)).kind == "revoke"


def test_razorpay_halted_revokes():
    assert razorpay_plan_change(rzp("subscription.halted")).kind == "revoke"


def test_signature():
    import hashlib
    import hmac
    sig = hmac.new(b"s", b"body", hashlib.sha256).hexdigest()
    assert verify_signature(b"body", sig, "s")
    assert not verify_signature(b"body", "bad", "s")


def test_effective_plan():
    assert effective_plan({"plan": "premium", "plan_expires_at": FUTURE}) == "premium"
    assert effective_plan({"plan": "pro", "plan_expires_at": PAST}) == "free"
    assert effective_plan({"plan": "lifetime"}) == "premium"
    assert effective_plan(None) == "free"
