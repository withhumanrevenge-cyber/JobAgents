"""Which AI runs a user's request, and on whose key.

Three modes:
  byok    - the user's own provider key. No credits are charged; the user's provider bills them.
  hosted  - our key, for paying plans. Each action spends plan credits.
  trial   - our key, for Free users without a key: a small monthly credit allowance and capped
            matching, so new users see the product work before setting up a key.

Free users with a key always use it. Paying users with a key choose (use_own_key)."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from app.config import get_settings
from app.db import first, get_db
from app.errors import ApiError
from app.plans import Plan, UsageAction, effective_plan
from app.services import crypto, llm
from app.services.usage import charge, refund

log = logging.getLogger(__name__)

Mode = Literal["byok", "hosted", "trial"]
HOSTED_PROVIDER = "groq"


def decide_mode(plan: Plan, key_row: dict[str, Any] | None) -> Mode:
    usable_key = bool(key_row) and key_row.get("status") != "invalid"
    if usable_key and (plan == "free" or key_row.get("use_own_key", True)):  # type: ignore[union-attr]
        return "byok"
    return "trial" if plan == "free" else "hosted"


@dataclass
class AIContext:
    user_id: str
    plan: Plan
    mode: Mode
    provider: str
    api_key: str
    fast_model: str
    quality_model: str

    @property
    def label(self) -> str:
        return llm.PROVIDERS[self.provider].label

    async def call(self, prompt: str, system: str | None = None, *, fast: bool = False) -> str:
        model = self.fast_model if fast else self.quality_model
        try:
            result = await llm.complete(self.provider, self.api_key, model, system, prompt, fast=fast)
        except llm.LLMAuthError:
            if self.mode == "byok":
                await _mark_key(self.user_id, "invalid", "The provider rejected this key.")
                raise ApiError(400, f"Your {self.label} key was rejected. Update it in Settings → AI provider.",
                               code="ai_key_invalid") from None
            log.error("Hosted AI key rejected")
            raise ApiError(503, "AI is temporarily unavailable. Please try again shortly.") from None
        except llm.LLMRateLimitError:
            if self.mode == "byok":
                raise ApiError(429, f"Your {self.label} key hit its rate limit or quota. Wait a minute, or check "
                                    f"your {self.label} account.", code="ai_key_quota") from None
            raise ApiError(503, "AI is temporarily rate-limited. Please try again shortly.") from None
        except llm.LLMModelError:
            if self.mode == "byok":
                raise ApiError(400, f"The model “{model}” isn't available on your {self.label} key. Pick another "
                                    "in Settings → AI provider.", code="ai_model_invalid") from None
            log.error("Hosted model %s unavailable", model)
            raise ApiError(503, "AI is temporarily unavailable. Please try again shortly.") from None
        except llm.LLMError as e:
            log.warning("AI call failed (%s, %s): %s", self.mode, self.provider, e.detail)
            raise ApiError(502, f"{self.label} returned an error. Please try again.") from None

        await _meter(self, result)
        return result.text


async def _meter(ctx: AIContext, result: llm.Completion) -> None:
    if not result.tokens:
        return
    # Hosted tokens are our cost; BYOK tokens are logged separately so admin totals stay honest.
    action = "byok_call" if ctx.mode == "byok" else "ai_call"
    try:
        db = await get_db()
        await db.table("usage_events").insert({
            "user_id": ctx.user_id, "action": action, "credits": 0,
            "tokens": result.tokens, "model": f"{ctx.provider}:{result.model}",
        }).execute()
    except Exception:
        log.warning("token metering failed", exc_info=True)


async def get_key_row(user_id: str) -> dict[str, Any] | None:
    db = await get_db()
    return await first(db.table("user_ai_keys").select("*").eq("user_id", user_id))


async def _mark_key(user_id: str, status: str, error: str | None) -> None:
    db = await get_db()
    try:
        await db.table("user_ai_keys").update({
            "status": status, "last_error": error, "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
    except Exception:
        log.warning("could not update key status", exc_info=True)


def _hosted(user_id: str, plan: Plan, mode: Mode) -> AIContext:
    s = get_settings()
    if not s.GROQ_API_KEY:
        raise ApiError(503, "Hosted AI isn't configured. Add your own AI key in Settings → AI provider.",
                       code="hosted_unavailable")
    return AIContext(user_id, plan, mode, HOSTED_PROVIDER, s.GROQ_API_KEY, s.GROQ_FAST_MODEL, s.GROQ_MODEL)


async def get_ai(user_id: str, profile: dict[str, Any] | None = None) -> AIContext:
    if profile is None:
        db = await get_db()
        profile = await first(db.table("profiles").select("plan, plan_expires_at").eq("user_id", user_id))
    plan = effective_plan(profile)
    key_row = await get_key_row(user_id)
    mode = decide_mode(plan, key_row)
    if mode != "byok":
        return _hosted(user_id, plan, mode)

    assert key_row is not None
    api_key = crypto.decrypt(key_row["key_ciphertext"])
    if not api_key:
        # Encrypted with a key that's since been rotated out: treat as no key.
        await _mark_key(user_id, "invalid", "Saved key can no longer be read. Please add it again.")
        mode = "trial" if plan == "free" else "hosted"
        return _hosted(user_id, plan, mode)
    provider = key_row["provider"]
    fast, quality = key_row.get("fast_model"), key_row.get("quality_model")
    if not fast or not quality:
        default_fast, default_quality = llm.pick_defaults(provider, [])
        fast, quality = fast or default_fast or "", quality or default_quality or ""
    return AIContext(user_id, plan, "byok", provider, api_key, fast, quality)


@asynccontextmanager
async def ai_action(user_id: str, action: UsageAction) -> AsyncIterator[AIContext]:
    """The AI for a credit-priced action. Hosted and trial modes spend credits (refunded if the
    block raises); BYOK spends none."""
    ctx = await get_ai(user_id)
    if ctx.mode == "byok":
        yield ctx
        return
    await charge(user_id, action, plan=ctx.plan, trial=ctx.mode == "trial")
    try:
        yield ctx
    except BaseException:
        await refund(user_id, action)
        raise
