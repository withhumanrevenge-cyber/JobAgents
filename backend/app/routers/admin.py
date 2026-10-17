from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import AuthUser, admin_user
from app.db import get_db, select_all
from app.plans import PLAN_CONFIG, effective_plan

router = APIRouter(prefix="/api/admin", tags=["admin"])

ACTIONS = ("smart_apply", "tailor", "interview")


def _month_start() -> str:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()


async def _usage_this_month() -> list[dict]:
    db = await get_db()
    return await select_all(lambda: db.table("usage_events").select("user_id, action, tokens, credits")
                            .gte("created_at", _month_start()).order("id"))


def _action_counts(events: list[dict]) -> dict[str, int]:
    # Refunds are logged as refund_<action>; a refunded action didn't happen.
    counts = {a: 0 for a in ACTIONS}
    for e in events:
        action = e.get("action") or ""
        if action in counts:
            counts[action] += 1
        elif action.startswith("refund_") and action[7:] in counts:
            counts[action[7:]] -= 1
    return counts


@router.get("/overview")
async def overview(_: AuthUser = Depends(admin_user)) -> dict:
    db = await get_db()
    profiles = await select_all(lambda: db.table("profiles").select("plan, plan_expires_at, created_at").order("id"))
    by_plan = {"free": 0, "pro": 0, "premium": 0}
    for p in profiles:
        by_plan[effective_plan(p)] += 1  # expired paid plans count as free

    events = await _usage_this_month()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    return {
        "totalUsers": len(profiles),
        "byPlan": by_plan,
        "activeUsers": len({e["user_id"] for e in events}),
        "newThisWeek": sum(1 for p in profiles if (p.get("created_at") or "") >= week_ago),
        # Hosted AI only: tokens on users' own keys (byok_call) aren't our cost.
        "tokensThisMonth": sum(e.get("tokens") or 0 for e in events if e.get("action") == "ai_call"),
        "byokTokensThisMonth": sum(e.get("tokens") or 0 for e in events if e.get("action") == "byok_call"),
        "creditsThisMonth": sum(e.get("credits") or 0 for e in events),
        "smartAppliesThisMonth": _action_counts(events)["smart_apply"],
        "mrr": by_plan["pro"] * PLAN_CONFIG["pro"]["priceUsd"] + by_plan["premium"] * PLAN_CONFIG["premium"]["priceUsd"],
    }


@router.get("/users")
async def users(_: AuthUser = Depends(admin_user)) -> dict:
    db = await get_db()
    profiles = (await db.table("profiles")
                .select("user_id, email, full_name, plan, plan_expires_at, is_admin, created_at")
                .order("created_at", desc=True).limit(500).execute()).data or []

    per_user: dict[str, list[dict]] = {}
    for e in await _usage_this_month():
        per_user.setdefault(e["user_id"], []).append(e)

    rows = []
    for p in profiles:
        events = per_user.get(p["user_id"], [])
        rows.append({
            "user_id": p["user_id"],
            "email": p.get("email"),
            "full_name": p.get("full_name"),
            "plan": p.get("plan") or "free",
            "plan_expires_at": p.get("plan_expires_at"),
            "is_admin": bool(p.get("is_admin")),
            "created_at": p.get("created_at"),
            **_action_counts(events),
            "credits": sum(e.get("credits") or 0 for e in events),
            "tokens": sum(e.get("tokens") or 0 for e in events if e.get("action") == "ai_call"),
        })
    return {"users": rows}


class SetPlanBody(BaseModel):
    user_id: str
    plan: Literal["free", "pro", "premium"]


@router.post("/set-plan")
async def set_plan(body: SetPlanBody, _: AuthUser = Depends(admin_user)) -> dict:
    expires = None if body.plan == "free" else (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    db = await get_db()
    await db.table("profiles").update({"plan": body.plan, "plan_expires_at": expires}).eq("user_id", body.user_id).execute()
    return {"ok": True, "plan": body.plan, "plan_expires_at": expires}


class GrantBody(BaseModel):
    user_id: str
    amount: int = Field(gt=0, le=10_000)


@router.post("/grant-credits")
async def grant_credits(body: GrantBody, _: AuthUser = Depends(admin_user)) -> dict:
    db = await get_db()
    await db.table("usage_events").insert(
        {"user_id": body.user_id, "action": "admin_grant", "credits": -body.amount, "tokens": 0}
    ).execute()
    return {"ok": True, "granted": body.amount}
