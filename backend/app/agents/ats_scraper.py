"""Public job-board APIs of individual companies (Greenhouse, Lever, Ashby). No keys needed."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.agents.text import (
    detect_country,
    detect_experience_level,
    detect_job_type,
    strip_html,
)

log = logging.getLogger(__name__)

PER_COMPANY_MAX = 200
DESCRIPTION_MAX = 4000
CONCURRENCY = 6

# (ats, slug, display name). Each slug was verified to return postings; dead slugs are skipped
# silently but still cost a request.
ATS_COMPANIES: list[tuple[str, str, str]] = [
    ("greenhouse", "anthropic", "Anthropic"),
    ("greenhouse", "stripe", "Stripe"),
    ("greenhouse", "airbnb", "Airbnb"),
    ("greenhouse", "dropbox", "Dropbox"),
    ("greenhouse", "gitlab", "GitLab"),
    ("greenhouse", "spacex", "SpaceX"),
    ("greenhouse", "databricks", "Databricks"),
    ("greenhouse", "mongodb", "MongoDB"),
    ("greenhouse", "elastic", "Elastic"),
    ("greenhouse", "cloudflare", "Cloudflare"),
    ("greenhouse", "rubrik", "Rubrik"),
    ("greenhouse", "instacart", "Instacart"),
    ("greenhouse", "robinhood", "Robinhood"),
    ("greenhouse", "coinbase", "Coinbase"),
    ("greenhouse", "brex", "Brex"),
    ("greenhouse", "twilio", "Twilio"),
    ("greenhouse", "okta", "Okta"),
    ("greenhouse", "gusto", "Gusto"),
    ("greenhouse", "discord", "Discord"),
    ("greenhouse", "affirm", "Affirm"),
    ("greenhouse", "lyft", "Lyft"),
    ("greenhouse", "pinterest", "Pinterest"),
    ("greenhouse", "reddit", "Reddit"),
    ("greenhouse", "fastly", "Fastly"),
    ("greenhouse", "asana", "Asana"),
    ("lever", "palantir", "Palantir"),
    ("lever", "cred", "CRED"),
    ("ashby", "Linear", "Linear"),
    ("ashby", "Notion", "Notion"),
    ("ashby", "Ramp", "Ramp"),
    ("ashby", "Perplexity", "Perplexity"),
    ("ashby", "Modal", "Modal"),
    ("ashby", "OpenAI", "OpenAI"),
    ("ashby", "ElevenLabs", "ElevenLabs"),
    # Indian companies, and global ones hiring heavily in India. Checked on 2026-10-13 for
    # public boards with India-located roles.
    ("lever", "paytm", "Paytm"),
    ("lever", "meesho", "Meesho"),
    ("lever", "zeta", "Zeta"),
    ("lever", "mindtickle", "Mindtickle"),
    ("lever", "hevodata", "Hevo Data"),
    ("lever", "pocketfm", "Pocket FM"),
    ("greenhouse", "inmobi", "InMobi"),
    ("greenhouse", "hackerrank", "HackerRank"),
    ("greenhouse", "druva", "Druva"),
    ("greenhouse", "groww", "Groww"),
    ("greenhouse", "observeai", "Observe.AI"),
    ("greenhouse", "glance", "Glance"),
    ("greenhouse", "yugabyte", "Yugabyte"),
    ("greenhouse", "zscaler", "Zscaler"),
    ("greenhouse", "agoda", "Agoda"),
    ("ashby", "sarvam", "Sarvam AI"),
    ("ashby", "atlan", "Atlan"),
    ("ashby", "bureau", "Bureau"),
    ("ashby", "spotdraft", "SpotDraft"),
]


def _iso(value: Any) -> str:
    """ISO timestamp from an ISO string or epoch milliseconds; now if missing or unparseable."""
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
        if isinstance(value, str) and value:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except (ValueError, OverflowError, OSError):
        pass
    return datetime.now(timezone.utc).isoformat()


def _job(
    *, source: str, source_id: Any, title: str | None, company: str, location: str | None,
    description: str, url: str, posted: Any, tags: list[str], remote_flag: bool = False,
) -> dict[str, Any]:
    title = title or "Untitled role"
    job_type = detect_job_type(location, description, remote_flag)
    return {
        "title": title,
        "company": company,
        "location": location or None,
        "country": detect_country(location),
        "region": None,
        "remote": remote_flag or job_type == "remote",
        "job_type": job_type,
        "experience_level": detect_experience_level(title),
        "url": url,
        "description": description[:DESCRIPTION_MAX],
        "salary_range": None,
        "tags": [t for t in tags if t],
        "posted_date": _iso(posted),
        "source": source,
        "source_id": str(source_id),
    }


def parse_greenhouse(data: dict[str, Any], slug: str, name: str) -> list[dict[str, Any]]:
    out = []
    for j in (data.get("jobs") or [])[:PER_COMPANY_MAX]:
        employment = next(
            (m.get("value") for m in (j.get("metadata") or []) if m and m.get("name") == "Employment Type"),
            None,
        )
        dept = ((j.get("departments") or [{}])[0] or {}).get("name")
        out.append(_job(
            source="greenhouse", source_id=j.get("id"), title=j.get("title"),
            company=j.get("company_name") or name, location=(j.get("location") or {}).get("name"),
            description=strip_html(j.get("content")),
            url=j.get("absolute_url") or f"https://boards.greenhouse.io/{slug}",
            posted=j.get("first_published") or j.get("updated_at"),
            tags=[dept, employment if isinstance(employment, str) else None],
        ))
    return out


def parse_lever(data: list[dict[str, Any]], slug: str, name: str) -> list[dict[str, Any]]:
    out = []
    for j in data[:PER_COMPANY_MAX]:
        cats = j.get("categories") or {}
        out.append(_job(
            source="lever", source_id=j.get("id"), title=j.get("text"), company=name,
            location=cats.get("location"), description=j.get("descriptionPlain") or "",
            url=j.get("hostedUrl") or f"https://jobs.lever.co/{slug}", posted=j.get("createdAt"),
            tags=[cats.get("department"), cats.get("team"), cats.get("commitment")],
        ))
    return out


def parse_ashby(data: dict[str, Any], slug: str, name: str) -> list[dict[str, Any]]:
    out = []
    for j in (data.get("jobs") or [])[:PER_COMPANY_MAX]:
        out.append(_job(
            source="ashby", source_id=j.get("id"), title=j.get("title"), company=name,
            location=j.get("location"),
            description=j.get("descriptionPlain") or strip_html(j.get("descriptionHtml")),
            url=j.get("externalLink") or j.get("applyUrl") or j.get("jobUrl") or f"https://jobs.ashbyhq.com/{slug}",
            posted=j.get("publishedAt"),
            tags=[j.get("department"), j.get("team"), j.get("employmentType")],
            remote_flag=bool(j.get("isRemote")),
        ))
    return out


_ENDPOINTS = {
    "greenhouse": ("https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true", parse_greenhouse),
    "lever": ("https://api.lever.co/v0/postings/{slug}?mode=json", parse_lever),
    "ashby": ("https://api.ashbyhq.com/posting-api/job-board/{slug}", parse_ashby),
}


async def _fetch_company(client: httpx.AsyncClient, ats: str, slug: str, name: str) -> list[dict[str, Any]]:
    url, parse = _ENDPOINTS[ats]
    try:
        res = await client.get(url.format(slug=slug))
        if res.status_code != 200:
            return []
        data = res.json()
        if ats == "lever" and not isinstance(data, list):
            return []
        return parse(data, slug, name)
    except Exception as e:  # one bad board must not sink the rest
        log.warning("ATS fetch failed for %s/%s: %s", ats, slug, e)
        return []


async def fetch_ats_jobs(sources: list[str]) -> list[dict[str, Any]]:
    companies = [c for c in ATS_COMPANIES if c[0] in sources]
    if not companies:
        return []
    sem = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:

        async def bounded(c: tuple[str, str, str]) -> list[dict[str, Any]]:
            async with sem:
                return await _fetch_company(client, *c)

        results = await asyncio.gather(*(bounded(c) for c in companies))
    return [job for batch in results for job in batch]
