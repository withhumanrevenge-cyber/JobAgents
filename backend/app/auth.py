import hashlib
import time
from dataclasses import dataclass

from fastapi import Depends, Request

from app.config import get_settings
from app.db import first, get_db
from app.errors import ApiError

_CACHE_TTL_S = 30
_CACHE_MAX = 5000
_cache: dict[str, tuple[float, "AuthUser"]] = {}


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


async def _verify(token: str) -> AuthUser | None:
    # Supabase Auth validates the token (signature, expiry, revoked sessions) whichever signing
    # key type the project uses. A short cache keeps loops like /api/match from re-verifying
    # the same token on every call.
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]

    db = await get_db()
    try:
        res = await db.auth.get_user(token)
    except Exception:
        return None
    if not res or not res.user:
        return None

    user = AuthUser(id=res.user.id, email=res.user.email)
    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[key] = (now + _CACHE_TTL_S, user)
    return user


async def current_user(request: Request) -> AuthUser:
    token = _bearer(request)
    user = await _verify(token) if token else None
    if not user:
        raise ApiError(401, "Unauthorized")
    return user


async def admin_user(user: AuthUser = Depends(current_user)) -> AuthUser:
    # Defense in depth: the email allowlist AND the DB flag must both agree.
    if (user.email or "").lower() not in get_settings().ADMIN_EMAILS:
        raise ApiError(403, "Forbidden")
    db = await get_db()
    profile = await first(db.table("profiles").select("is_admin").eq("user_id", user.id))
    if not profile or not profile.get("is_admin"):
        raise ApiError(403, "Forbidden")
    return user
