"""Fixed-window rate limiting, in process memory.

Correct for a single backend process (the deployment model: one async uvicorn worker). If the
backend is ever scaled to several processes, move the counters to Redis."""

import time
from collections.abc import Awaitable, Callable

from fastapi import Depends, Request

from app.auth import AuthUser, current_user
from app.errors import ApiError

_windows: dict[str, tuple[float, int]] = {}
_MAX_KEYS = 50_000


def _hit(key: str, limit: int, window_s: int) -> None:
    now = time.monotonic()
    reset_at, count = _windows.get(key, (0.0, 0))
    if reset_at <= now:
        reset_at, count = now + window_s, 0
    if count >= limit:
        raise ApiError(429, "Rate limit exceeded. Please try again later.", retry_after=max(1, int(reset_at - now)))
    if len(_windows) >= _MAX_KEYS:
        _windows.clear()
    _windows[key] = (reset_at, count + 1)


def limited_user(bucket: str, limit: int, window_s: int = 60) -> Callable[..., Awaitable[AuthUser]]:
    """Dependency: authenticates the caller, then counts against their user id."""

    async def dependency(user: AuthUser = Depends(current_user)) -> AuthUser:
        _hit(f"{bucket}:{user.id}", limit, window_s)
        return user

    return dependency


def limited_ip(bucket: str, limit: int, window_s: int = 60) -> Callable[[Request], Awaitable[None]]:
    async def dependency(request: Request) -> None:
        # Run uvicorn with --proxy-headers so this is the real client behind the host's proxy.
        _hit(f"{bucket}:{request.client.host if request.client else 'unknown'}", limit, window_s)

    return dependency


# Groq-backed actions.
ai_user = limited_user("ai", 10)
# /api/match is called in a loop by the client during one "Find jobs" run.
match_user = limited_user("match", 40)
general_user = limited_user("general", 120)
