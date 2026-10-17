"""The user's own AI provider key: save (after checking it works), choose models, remove."""

import re
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import AuthUser
from app.db import first, get_db
from app.errors import ApiError
from app.plans import effective_plan
from app.ratelimit import general_user, limited_user
from app.services import crypto, llm
from app.services.ai import decide_mode, get_ai, get_key_row

router = APIRouter(prefix="/api/ai", tags=["ai"])

key_user = limited_user("ai-key", 10)

ProviderId = Literal["groq", "gemini", "openai", "anthropic", "openrouter"]
_MODEL_ID = re.compile(r"^[\w.:/@+-]{1,200}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _providers() -> list[dict[str, Any]]:
    return [{"id": p.id, "label": p.label, "key_url": p.key_url, "note": p.note} for p in llm.PROVIDERS.values()]


async def _settings(user_id: str) -> dict[str, Any]:
    db = await get_db()
    profile = await first(db.table("profiles").select("plan, plan_expires_at").eq("user_id", user_id))
    plan = effective_plan(profile)
    row = await get_key_row(user_id)
    key = None
    if row:
        key = {
            "provider": row["provider"],
            "provider_label": llm.PROVIDERS[row["provider"]].label,
            "hint": row["key_hint"],
            "status": row["status"],
            "last_error": row.get("last_error"),
            "fast_model": row.get("fast_model"),
            "quality_model": row.get("quality_model"),
            "use_own_key": row.get("use_own_key", True),
            "background_matching": row.get("background_matching", True),
            "verified_at": row.get("verified_at"),
        }
    return {"plan": plan, "mode": decide_mode(plan, row), "key": key, "providers": _providers()}


@router.get("/settings")
async def get_settings_route(user: AuthUser = Depends(general_user)) -> dict:
    return await _settings(user.id)


class SaveKeyBody(BaseModel):
    provider: ProviderId
    api_key: str = Field(min_length=10, max_length=400)


def _key_error(provider: str, e: llm.LLMError) -> ApiError:
    label = llm.PROVIDERS[provider].label
    if isinstance(e, llm.LLMAuthError):
        return ApiError(400, f"{label} rejected this key. Check you copied all of it, and that it's active.")
    if isinstance(e, llm.LLMRateLimitError):
        return ApiError(400, f"{label} accepted the key but says it's out of quota or rate-limited. Check your "
                             f"{label} account, then try again.")
    return ApiError(502, f"Couldn't check the key with {label} right now. Please try again.")


@router.post("/key")
async def save_key(body: SaveKeyBody, user: AuthUser = Depends(key_user)) -> dict:
    api_key = body.api_key.strip()
    if any(c.isspace() for c in api_key):
        raise ApiError(400, "That doesn't look like an API key: it contains spaces.")

    # Listing models proves the key works and tells us which models it can use.
    try:
        models = await llm.list_models(body.provider, api_key)
    except llm.LLMError as e:
        raise _key_error(body.provider, e) from None
    if not models:
        raise ApiError(400, f"This {llm.PROVIDERS[body.provider].label} key has no chat models available.")

    fast, quality = llm.pick_defaults(body.provider, models)
    db = await get_db()
    await db.table("user_ai_keys").upsert({
        "user_id": user.id,
        "provider": body.provider,
        "key_ciphertext": crypto.encrypt(api_key),
        "key_hint": crypto.hint(api_key),
        "fast_model": fast,
        "quality_model": quality,
        "status": "valid",
        "last_error": None,
        "verified_at": _now(),
        "updated_at": _now(),
    }, on_conflict="user_id").execute()
    return {**await _settings(user.id), "models": models}


@router.get("/models")
async def models(user: AuthUser = Depends(key_user)) -> dict:
    row = await get_key_row(user.id)
    api_key = crypto.decrypt(row["key_ciphertext"]) if row else None
    if not row or not api_key:
        raise ApiError(404, "Add an AI key first.")
    try:
        return {"models": await llm.list_models(row["provider"], api_key)}
    except llm.LLMError as e:
        raise _key_error(row["provider"], e) from None


class UpdateBody(BaseModel):
    fast_model: str | None = None
    quality_model: str | None = None
    use_own_key: bool | None = None
    background_matching: bool | None = None


@router.patch("/settings")
async def update_settings(body: UpdateBody, user: AuthUser = Depends(general_user)) -> dict:
    if not await get_key_row(user.id):
        raise ApiError(404, "Add an AI key first.")
    fields: dict[str, Any] = {}
    for name in ("fast_model", "quality_model"):
        value = getattr(body, name)
        if value is not None:
            value = value.strip()
            if not _MODEL_ID.match(value):
                raise ApiError(400, "That model name isn't valid.")
            fields[name] = value
    for name in ("use_own_key", "background_matching"):
        if getattr(body, name) is not None:
            fields[name] = getattr(body, name)
    if fields:
        if "fast_model" in fields or "quality_model" in fields:
            # A new model may work where the old one didn't: clear a model-related error.
            fields.update({"status": "valid", "last_error": None})
        fields["updated_at"] = _now()
        db = await get_db()
        await db.table("user_ai_keys").update(fields).eq("user_id", user.id).execute()
    return await _settings(user.id)


@router.post("/test")
async def test_key(user: AuthUser = Depends(key_user)) -> dict:
    """One tiny request on each chosen model, so a bad model choice shows up here and not in
    the middle of a Smart Apply."""
    ai = await get_ai(user.id)
    if ai.mode != "byok":
        raise ApiError(400, "Add your own AI key first (or turn on “Use my key”).")
    for fast in (True, False):
        await ai.call("Reply with the single word OK.", fast=fast)
    db = await get_db()
    await db.table("user_ai_keys").update({"status": "valid", "last_error": None, "verified_at": _now()}) \
        .eq("user_id", user.id).execute()
    return {"ok": True, "fast_model": ai.fast_model, "quality_model": ai.quality_model}


@router.delete("/key")
async def delete_key(user: AuthUser = Depends(general_user)) -> dict:
    db = await get_db()
    await db.table("user_ai_keys").delete().eq("user_id", user.id).execute()
    return await _settings(user.id)
