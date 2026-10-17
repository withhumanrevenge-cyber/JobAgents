"""Credit metering on the append-only usage_events ledger.

consume_credits (migration 010) checks and spends credits atomically under an advisory lock.
Refunds append a negative row instead of deleting one: deleting "the latest row for this
action" could remove a concurrent request's charge."""

import logging
from dataclasses import dataclass

from app.db import first, get_db
from app.errors import ApiError
from app.plans import CREDIT_COST, PLAN_CONFIG, Plan, UsageAction, effective_plan

log = logging.getLogger(__name__)


@dataclass
class CreditState:
    plan: Plan
    allotment: int
    used: int
    remaining: int


async def _plan_for(user_id: str) -> Plan:
    db = await get_db()
    profile = await first(db.table("profiles").select("plan, plan_expires_at").eq("user_id", user_id))
    return effective_plan(profile)


async def credits_used_this_month(user_id: str) -> int:
    db = await get_db()
    res = await db.rpc("credits_used_this_month", {"p_user_id": user_id}).execute()
    return int(res.data or 0)


async def get_credit_state(user_id: str) -> CreditState:
    plan = await _plan_for(user_id)
    allotment = PLAN_CONFIG[plan]["credits"]
    used = await credits_used_this_month(user_id)
    return CreditState(plan=plan, allotment=allotment, used=used, remaining=max(0, allotment - used))


def _out_of_credits(plan: Plan, trial: bool) -> ApiError:
    if trial:
        return ApiError(402, "You've used this month's free AI trial. Add your own AI key (Groq and Gemini keys are "
                             "free) to keep going without limits, or upgrade for hosted AI.",
                        upgrade=True, needs_key=True)
    return ApiError(402, "You're out of credits this month. They reset next month, or upgrade your plan for more. "
                         "You can also switch to your own AI key in Settings.", upgrade=True)


async def charge(user_id: str, action: UsageAction, *, plan: Plan | None = None, trial: bool = False) -> None:
    """Spend the action's credits or raise 402. Fails closed: if the ledger can't be checked,
    the action doesn't run (the old fallback did a racy check-then-insert)."""
    plan = plan or await _plan_for(user_id)
    db = await get_db()
    try:
        res = await db.rpc(
            "consume_credits",
            {
                "p_user_id": user_id,
                "p_action": action,
                "p_cost": CREDIT_COST[action],
                "p_allotment": PLAN_CONFIG[plan]["credits"],
            },
        ).execute()
    except Exception:
        log.exception("consume_credits failed")
        raise ApiError(503, "Couldn't check your credits right now. Please try again.") from None
    if res.data is not True:
        raise _out_of_credits(plan, trial)


async def refund(user_id: str, action: UsageAction) -> None:
    db = await get_db()
    try:
        await db.table("usage_events").insert(
            {"user_id": user_id, "action": f"refund_{action}", "credits": -CREDIT_COST[action], "tokens": 0}
        ).execute()
    except Exception:
        log.exception("refund failed for %s %s", user_id, action)
