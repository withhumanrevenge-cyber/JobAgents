"""Plan limits and prices. The numbers live in plans.json, which the Next.js frontend imports
too (lib/plans.ts), so enforcement here and the prices/limits shown in the UI can't drift."""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

Plan = Literal["free", "pro", "premium"]
UsageAction = Literal["smart_apply", "tailor", "interview"]

ALL_SOURCES = ["adzuna", "greenhouse", "lever", "ashby"]

_data = json.loads((Path(__file__).parent / "plans.json").read_text(encoding="utf-8"))
PLAN_CONFIG: dict[str, dict[str, Any]] = _data["plans"]
CREDIT_COST: dict[str, int] = _data["creditCost"]
ACTION_LABEL: dict[str, str] = _data["actionLabel"]


def effective_plan(profile: dict[str, Any] | None) -> Plan:
    profile = profile or {}
    raw = profile.get("plan")
    # 'lifetime' is a legacy value that maps to premium.
    plan: Plan = "pro" if raw == "pro" else "premium" if raw in ("premium", "lifetime") else "free"
    expires = profile.get("plan_expires_at")
    if plan != "free" and expires:
        try:
            if datetime.fromisoformat(expires.replace("Z", "+00:00")) < datetime.now(timezone.utc):
                return "free"
        except ValueError:
            pass
    return plan


def sources_for(plan: Plan) -> list[str]:
    return ALL_SOURCES if PLAN_CONFIG[plan]["allSources"] else ["adzuna"]


def price_label(plan: Plan, currency: Literal["USD", "INR"]) -> str:
    cfg = PLAN_CONFIG[plan]
    if currency == "INR":
        return f"₹{round(cfg['priceInrPaise'] / 100)}"
    return f"${cfg['priceUsd']}"
