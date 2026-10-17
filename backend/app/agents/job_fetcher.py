"""Pulls jobs from Adzuna and the ATS boards into the shared `jobs` pool."""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from app.agents.ats_scraper import fetch_ats_jobs
from app.agents.text import detect_experience_level, detect_job_type, strip_html
from app.config import get_settings
from app.countries import (
    ADZUNA_SUPPORTED,
    COUNTRY_CURRENCY,
    COUNTRY_NAME,
    DEFAULT_COUNTRY,
)
from app.db import get_db

log = logging.getLogger(__name__)

DEFAULT_QUERIES = [
    "software engineer",
    "frontend developer",
    "backend developer",
    "full stack developer",
    "data analyst",
    "product manager",
    "devops engineer",
    "ui ux designer",
]

RECENT_DAYS = 180
_ats_fetched_at = float("-inf")
UPSERT_CHUNK = 500

_SYMBOL = {
    "USD": "$", "INR": "₹", "GBP": "£", "EUR": "€", "CAD": "CA$", "AUD": "A$", "SGD": "S$",
    "BRL": "R$", "MXN": "MX$", "NZD": "NZ$", "PLN": "zł", "ZAR": "R", "CHF": "CHF ",
}


def format_salary(lo: float | None, hi: float | None, country: str) -> str | None:
    """Adzuna reports salaries in the searched country's currency, not always dollars."""
    symbol = _SYMBOL.get(COUNTRY_CURRENCY.get(country, "USD"), "$")
    fmt = lambda v: f"{symbol}{round(v / 1000)}k"  # noqa: E731
    if lo and hi and round(lo / 1000) != round(hi / 1000):
        return f"{fmt(lo)} - {fmt(hi)}"
    if lo or hi:
        return fmt(lo or hi)  # type: ignore[arg-type]
    return None


def _is_recent(job: dict[str, Any]) -> bool:
    try:
        posted = datetime.fromisoformat(job["posted_date"])
    except (KeyError, TypeError, ValueError):
        return True
    return datetime.now(timezone.utc) - posted <= timedelta(days=RECENT_DAYS)


def parse_adzuna(results: list[dict[str, Any]], country: str) -> list[dict[str, Any]]:
    jobs = []
    for j in results:
        title = j.get("title") or "Untitled role"
        description = strip_html(j.get("description"))
        location = (j.get("location") or {}).get("display_name") or None
        area = (j.get("location") or {}).get("area") or []
        job_type = detect_job_type(location, description)
        created = j.get("created")
        try:
            posted = datetime.fromisoformat(created.replace("Z", "+00:00")).isoformat() if created else None
        except ValueError:
            posted = None
        jobs.append({
            "title": strip_html(title),
            "company": (j.get("company") or {}).get("display_name") or "Unknown Company",
            "location": location,
            "country": COUNTRY_NAME.get(country) or (area[0] if area else "Unknown"),
            "region": area[1] if len(area) > 1 else None,
            "remote": job_type == "remote",
            "job_type": job_type,
            "experience_level": detect_experience_level(title),
            "url": j.get("redirect_url") or "https://adzuna.com",
            "description": description,
            "salary_range": format_salary(j.get("salary_min"), j.get("salary_max"), country),
            "tags": [c for c in [(j.get("category") or {}).get("label")] if c],
            "posted_date": posted or datetime.now(timezone.utc).isoformat(),
            "source": "adzuna",
            "source_id": str(j.get("id")),
        })
    return jobs


async def _adzuna_page(client: httpx.AsyncClient, url: str) -> list[dict[str, Any]]:
    delay = 1.0
    for attempt in range(3):
        try:
            res = await client.get(url)
            if res.status_code == 200:
                return res.json().get("results") or []
            # 4xx other than 429 won't succeed on retry (bad key, unsupported country).
            if res.status_code < 500 and res.status_code != 429:
                log.warning("Adzuna returned %s", res.status_code)
                return []
        except (httpx.HTTPError, ValueError) as e:
            log.warning("Adzuna request failed: %s", e)
        if attempt < 2:
            await asyncio.sleep(delay)
            delay *= 2
    return []


async def fetch_adzuna_jobs(query: str | None, country: str, pages: int = 5) -> list[dict[str, Any]]:
    s = get_settings()
    if not s.ADZUNA_APP_ID or not s.ADZUNA_APP_KEY:
        log.warning("Adzuna credentials missing; skipping Adzuna.")
        return []
    cc = country.upper()
    if cc not in ADZUNA_SUPPORTED:
        return []

    params = urlencode({
        "app_id": s.ADZUNA_APP_ID,
        "app_key": s.ADZUNA_APP_KEY,
        "title_only": query or "software engineer",
        "results_per_page": 50,
    })
    pages = max(1, min(pages, 5))
    async with httpx.AsyncClient(timeout=15.0) as client:
        results = await asyncio.gather(*(
            _adzuna_page(client, f"https://api.adzuna.com/v1/api/jobs/{cc.lower()}/search/{p}?{params}")
            for p in range(1, pages + 1)
        ))
    return parse_adzuna([r for page in results for r in page], cc)


async def sync_all_jobs(
    queries: list[str] | None,
    countries: list[str] | None,
    *,
    sources: list[str],
    adzuna_pages: int = 5,
    ats_max_age_s: float | None = None,
) -> dict[str, int]:
    """ats_max_age_s: skip the company boards if this process fetched them more recently than
    this. The boards are the same for every user, so one user's "Find jobs" shouldn't re-pull
    50+ boards that another user's click refreshed minutes ago."""
    role_queries: list[str | None] = list(queries) if queries else [None]
    country_codes = [c.upper() for c in countries] if countries else [DEFAULT_COUNTRY]

    tasks = []
    if "adzuna" in sources:
        tasks += [fetch_adzuna_jobs(q, c, adzuna_pages) for q in role_queries for c in country_codes]
    # ATS boards are company lists, not searches: fetch once regardless of queries/countries.
    ats_sources = [s for s in sources if s != "adzuna"]
    global _ats_fetched_at
    fresh = ats_max_age_s is not None and time.monotonic() - _ats_fetched_at < ats_max_age_s
    if ats_sources and not fresh:
        _ats_fetched_at = time.monotonic()
        tasks.append(fetch_ats_jobs(ats_sources))

    batches = await asyncio.gather(*tasks)
    fetched = [job for batch in batches for job in batch]

    seen: set[str] = set()
    unique = []
    for job in fetched:
        key = f"{job['source']}:{job['source_id']}"
        if key not in seen and _is_recent(job):
            seen.add(key)
            unique.append(job)

    if not unique:
        return {"fetched": len(fetched), "new": 0, "duplicates": 0}

    db = await get_db()
    new = 0
    for i in range(0, len(unique), UPSERT_CHUNK):
        chunk = unique[i : i + UPSERT_CHUNK]
        try:
            res = await db.table("jobs").upsert(
                chunk, on_conflict="source,source_id", ignore_duplicates=True
            ).execute()
            new += len(res.data or [])
        except Exception:
            log.exception("job upsert failed")
    return {"fetched": len(fetched), "new": new, "duplicates": len(unique) - new}
