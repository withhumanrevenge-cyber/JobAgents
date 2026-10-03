# backend/app/agents/job_fetcher.py
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from tenacity import retry, stop_after_attempt, wait_exponential
import httpx
from app.services.supabase_service import supabase_service
from app.agents.ats_scraper import fetch_ats_jobs
from app.core.config import settings

logger = logging.getLogger(__name__)

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

DEFAULT_COUNTRY = "US"
RECENT_DAYS = 180
ADZUNA_SUPPORTED = {
    "US", "GB", "CA", "AU", "DE", "FR", "IN", "NL", "SG", "IE", "ES", "IT", "BR", "MX", "ZA", "PL", "NZ", "CH", "AT", "BE"
}

COUNTRY_NAME = {
    "US": "United States", "GB": "United Kingdom", "CA": "Canada", "DE": "Germany",
    "FR": "France", "IN": "India", "AU": "Australia", "NL": "Netherlands",
    "SG": "Singapore", "IE": "Ireland", "ES": "Spain", "IT": "Italy",
    "BR": "Brazil", "MX": "Mexico", "ZA": "South Africa", "PL": "Poland",
    "NZ": "New Zealand", "CH": "Switzerland", "AT": "Austria", "BE": "Belgium",
}

US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
}

INDIA_CITIES = ["bangalore","bengaluru","hyderabad","chennai","mumbai","pune","gurgaon","gurugram","noida","delhi","new delhi","kolkata","ahmedabad","kochi","cochin","jaipur","chandigarh","indore","trivandrum","thiruvananthapuram"]
UK_HINTS = ["london","manchester","edinburgh","birmingham","bristol","leeds","glasgow"]
CANADA_HINTS = ["toronto","vancouver","montreal","ottawa","calgary","edmonton"]
DE_HINTS = ["berlin","munich","münchen","hamburg","frankfurt","cologne","köln"]
AU_HINTS = ["sydney","melbourne","brisbane","perth","adelaide"]


def detect_country(loc: str) -> str:
    if not loc:
        return "Unknown"
    l = loc.lower()
    if l.includes("india"): return "India"
    if any(c in l for c in INDIA_CITIES): return "India"
    if any(x in l for x in ["united states", "u.s.", "usa"]): return "United States"
    if any(x in l for x in ["united kingdom", " uk", ", uk"]): return "United Kingdom"
    if any(c in l for c in UK_HINTS): return "United Kingdom"
    if "canada" in l or any(c in l for c in CANADA_HINTS): return "Canada"
    if "germany" in l or any(c in l for c in DE_HINTS): return "Germany"
    if "france" in l or "paris" in l: return "France"
    if "australia" in l or any(c in l for c in AU_HINTS): return "Australia"
    if "singapore" in l: return "Singapore"
    if "ireland" in l or "dublin" in l: return "Ireland"
    if "netherlands" in l or "amsterdam" in l: return "Netherlands"
    if "brazil" in l or "são paulo" in l or "sao paulo" in l: return "Brazil"
    if "mexico" in l: return "Mexico"
    if "japan" in l or "tokyo" in l: return "Japan"
    if any(x in l for x in ["worldwide", "anywhere", "global", "remote"]): return "Worldwide"
    if "europe" in l or "emea" in l: return "Europe"
    
    parts = [p.strip() for p in loc.split(",")]
    tail = parts[-1] if parts else ""
    if tail and tail.upper() in US_STATES:
        return "United States"
    
    return "Unknown"


def detect_job_type(location: str, description: str, remote_flag: bool = False) -> str:
    h = f"{location or ''} {(description or '')[:500]}".lower()
    if "hybrid" in h: return "hybrid"
    if remote_flag or any(x in h for x in ["remote", "worldwide", "anywhere", "work from home"]): return "remote"
    if any(x in h for x in ["on-site", "onsite", "in-office", "in office"]): return "onsite"
    return "remote" if remote_flag else "unknown"


def detect_experience_level(title: str) -> str:
    t = (title or "").lower()
    if any(x in t for x in ["staff", "principal", "architect", "distinguished", "director", "vp", "head of", "tech lead", "engineering manager", "founding"]): return "lead"
    if any(x in t for x in ["senior", "sr."]): return "senior"
    if any(x in t for x in ["junior", "jr.", "entry", "intern", "associate", "graduate", "new grad"]): return "entry"
    if "engineer i" in t: return "entry"
    if "engineer iii" in t or "engineer iv" in t: return "senior"
    return "mid"


def is_recent(job: Dict[str, Any]) -> bool:
    posted = job.get("posted_date")
    if not posted:
        return True
    try:
        from datetime import datetime, timezone
        posted_dt = datetime.fromisoformat(posted.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - posted_dt).days <= RECENT_DAYS
    except:
        return True


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def fetch_adzuna_jobs(
    query: str = "software engineer",
    country_code: str = DEFAULT_COUNTRY,
    page_count: int = 5
) -> List[Dict[str, Any]]:
    app_id = settings.ADZUNA_APP_ID
    app_key = settings.ADZUNA_APP_KEY

    if not app_id or not app_key or "your-" in app_id or "your-" in app_key:
        logger.warning("Adzuna API credentials missing. Skipping Adzuna fetch.")
        return []

    cc = country_code.upper()
    if cc not in ADZUNA_SUPPORTED:
        logger.warning(f"Adzuna doesn't support country '{cc}'. Skipping.")
        return []

    try:
        encoded_query = httpx.URL(query).params  # This will encode properly
        import urllib.parse
        encoded_query = urllib.parse.quote(query)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            pages = range(1, min(max(1, page_count), 5) + 1)
            tasks = []
            for page in pages:
                url = f"https://api.adzuna.com/v1/api/jobs/{cc.lower()}/search/{page}?app_id={app_id}&app_key={app_key}&title_only={encoded_query}&results_per_page=50"
                tasks.append(client.get(url))
            
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            results = []
            for resp in responses:
                if isinstance(resp, Exception):
                    logger.warning(f"Adzuna request failed: {resp}")
                    continue
                if resp.status_code != 200:
                    logger.warning(f"Adzuna HTTP {resp.status_code}")
                    continue
                try:
                    data = resp.json()
                    results.extend(data.get("results", []))
                except Exception as e:
                    logger.warning(f"Adzuna JSON parse failed: {e}")
            
            return [transform_adzuna_job(job, cc) for job in results]
    
    except Exception as e:
        logger.error(f"Failed to fetch from Adzuna: {e}")
        return []


def transform_adzuna_job(job: Dict[str, Any], cc: str) -> Dict[str, Any]:
    tags = []
    if job.get("category", {}).get("label"):
        tags.append(job["category"]["label"])

    salary_min = job.get("salary_min")
    salary_max = job.get("salary_max")
    salary = None
    if salary_min and salary_max:
        salary = f"${salary_min//1000}k - ${salary_max//1000}k"
    elif salary_min:
        salary = f"${salary_min//1000}k"

    loc = job.get("location", {}).get("display_name", "")
    job_type = detect_job_type(loc, job.get("description", "") or "")
    area = job.get("location", {}).get("area", [])
    country = COUNTRY_NAME.get(cc, area[0] if area else "Unknown")
    region = area[1] if len(area) > 1 else None
    title = job.get("title") or "Untitled role"

    return {
        "title": title,
        "company": job.get("company", {}).get("display_name", "Unknown Company"),
        "location": loc or None,
        "country": country,
        "region": region,
        "remote": job_type == "remote",
        "job_type": job_type,
        "experience_level": detect_experience_level(title),
        "url": job.get("redirect_url", "https://adzuna.com"),
        "description": job.get("description", "") or "",
        "salary_range": salary,
        "tags": tags,
        "posted_date": job.get("created") or datetime.utcnow().isoformat(),
        "source": "adzuna",
        "source_id": str(job.get("id", "")),
    }


async def sync_all_jobs(
    queries: Optional[List[str] | str] = None,
    countries: Optional[List[str] | str] = None,
    sources: Optional[List[str]] = None,
    adzuna_pages: int = 5
) -> Dict[str, int]:
    """Main entry point for job synchronization"""
    sources = sources or ["adzuna", "greenhouse", "lever", "ashby"]
    use_adzuna = "adzuna" in sources
    use_ats = any(s in sources for s in ["greenhouse", "lever", "ashby"])

    # Normalize queries
    if isinstance(queries, str):
        role_queries = [queries] if queries else [None]
    elif isinstance(queries, list):
        role_queries = queries if queries else [None]
    else:
        role_queries = [None]

    # Normalize countries
    if isinstance(countries, str):
        country_codes = [countries] if countries else [DEFAULT_COUNTRY]
    elif isinstance(countries, list):
        country_codes = countries if countries else [DEFAULT_COUNTRY]
    else:
        country_codes = [DEFAULT_COUNTRY]

    fetched_jobs = []

    # Fetch from Adzuna
    if use_adzuna:
        adzuna_tasks = []
        for q in role_queries:
            for c in country_codes:
                adzuna_tasks.append(fetch_adzuna_jobs(q or "software engineer", c, adzuna_pages))
        
        import asyncio
        adzuna_results = await asyncio.gather(*adzuna_tasks, return_exceptions=True)
        for r in adzuna_results:
            if isinstance(r, list):
                fetched_jobs.extend(r)
            elif isinstance(r, Exception):
                logger.warning(f"Adzuna fetch error: {r}")

    # Fetch from ATS
    if use_ats:
        ats_results = await fetch_ats_jobs()
        # Filter by requested sources
        ats_filtered = [j for j in ats_results if j.get("source") in sources]
        fetched_jobs.extend(ats_filtered)

    # Deduplicate and filter recent
    seen = set()
    unique_jobs = []
    for job in fetched_jobs:
        if not is_recent(job):
            continue
        key = f"{job.get('source')}:{job.get('source_id')}"
        if key in seen:
            continue
        seen.add(key)
        unique_jobs.append(job)

    if not unique_jobs:
        return {"fetched": len(fetched_jobs), "new": 0, "duplicates": 0}

    # Bulk upsert
    stats = await supabase_service.upsert_jobs(unique_jobs)
    return stats


# Import at bottom to avoid circular imports
import asyncio
from datetime import datetime