import asyncio
from collections.abc import Callable
from typing import Any

from supabase import AsyncClient, acreate_client

from app.config import get_settings

_client: AsyncClient | None = None
# The event loop the client was created on. On Vercel a function instance may run requests on a
# fresh loop; a client bound to a closed loop would fail, so it's rebuilt for the new one.
_client_loop: asyncio.AbstractEventLoop | None = None


async def get_db() -> AsyncClient:
    """The service-role client. It bypasses RLS, so every query on user data must filter by
    the authenticated user's id explicitly. Never sign in with it: a sign-in would swap its
    service key for that user's token for every request in the process."""
    global _client, _client_loop
    loop = asyncio.get_running_loop()
    if _client is None or _client_loop is not loop:
        s = get_settings()
        _client = await acreate_client(s.SUPABASE_URL, s.SUPABASE_SERVICE_ROLE_KEY)
        _client_loop = loop
    return _client


async def select_all(make_query: Callable[[], Any], page: int = 1000) -> list[dict[str, Any]]:
    """Every row of a select, paging past PostgREST's 1000-row response cap. make_query must
    return a fresh, deterministically ordered query each call."""
    rows: list[dict[str, Any]] = []
    while True:
        res = await make_query().range(len(rows), len(rows) + page - 1).execute()
        batch = res.data or []
        rows += batch
        if len(batch) < page:
            return rows


async def first(query: Any) -> dict[str, Any] | None:
    """First row of a select, or None. Avoids .single()/.maybe_single(), whose no-row
    behaviour (raise vs return None) has changed between postgrest-py versions."""
    res = await query.limit(1).execute()
    return res.data[0] if res.data else None
