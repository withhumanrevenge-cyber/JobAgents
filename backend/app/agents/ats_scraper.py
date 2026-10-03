# backend/app/agents/ats_scraper.py
import logging
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from tenacity import retry, stop_after_attempt, wait_exponential
import httpx
from app.lib.ats_companies import ATS_COMPANIES
from html import unescape

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 12.0
PER_COMPANY_MAX = 200
ATS_CONCURRENCY = 6


def decode_entities(text: str) -> str:
    """Decode HTML entities"""
    return unescape(unescape(text))


def strip_html(text: str) -> str:
    """Strip HTML tags, handling double-encoded entities"""
    if not text:
        return ""
    
    # Decode entities recursively
    decoded = text
    previous = ""
    while decoded != previous:
        previous = decoded
        decoded = decode_entities(decoded)
    
    # Remove script and style tags
    decoded = re.sub(r"<script[\s\S]*?</script>", " ", decoded, flags=re.IGNORECASE)
    decoded = re.sub(r"<style[\s\S]*?</style>", " ", decoded, flags=re.IGNORECASE)
    
    # Remove all other tags
    decoded = re.sub(r"<[^>]+>", " ", decoded)
    
    # Normalize whitespace
    return re.sub(r"\s+", " ", decoded).strip()


def detect_country(loc: str) -> str:
    if not loc:
        return "Unknown"
    l = loc.lower()
    if "india" in l: return "India"
    if any(c in l for c in ["bangalore","bengaluru","hyderabad","chennai","mumbai","pune","gurgaon","gurugram","noida","delhi","new delhi","kolkata","ahmedabad","kochi","cochin","jaipur","chandigarh","indore","trivandrum","thiruvananthapuram"]): return "India"
    if any(x in l for x in ["united states", "u.s.", "usa"]): return "United States"
    if any(x in l for x in ["united kingdom", " uk", ", uk"]): return "United Kingdom"
    if any(c in l for c in ["london","manchester","edinburgh","birmingham","bristol","leeds","glasgow"]): return "United Kingdom"
    if "canada" in l or any(c in l for c in ["toronto","vancouver","montreal","ottawa","calgary","edmonton"]): return "Canada"
    if "germany" in l or any(c in l for c in ["berlin","munich","münchen","hamburg","frankfurt","cologne","köln"]): return "Germany"
    if "france" in l or "paris" in l: return "France"
    if "australia" in l or any(c in l for c in ["sydney","melbourne","brisbane","perth","adelaide"]): return "Australia"
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
    us_states = {"AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"}
    if tail and tail.upper() in us_states:
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
    if "senior" in t or "sr." in t: return "senior"
    if any(x in t for x in ["junior", "jr.", "entry", "intern", "associate", "graduate", "new grad"]): return "entry"
    if "engineer i" in t: return "entry"
    if "engineer iii" in t or "engineer iv" in t: return "senior"
    return "mid"


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def safe_fetch(url: str) -> Optional[httpx.Response]:
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp
        except Exception as e:
            logger.debug(f"Fetch failed for {url}: {e}")
    return None


async def fetch_greenhouse(slug: str) -> List[Dict[str, Any]]:
    resp = await safe_fetch(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true")
    if not resp:
        return []
    
    try:
        data = resp.json()
    except:
        return []
    
    jobs = data.get("jobs", [])[:PER_COMPANY_MAX]
    results = []
    
    for j in jobs:
        loc = j.get("location", {}).get("name", "")
        desc = strip_html(j.get("content", "") or "")[:4000]
        job_type = detect_job_type(loc, desc)
        dept = (j.get("departments") or [{}])[0].get("name")
        emp_type = next((m.get("value") for m in (j.get("metadata") or []) if m.get("name") == "Employment Type"), None)
        title = j.get("title") or "Untitled role"
        tags = []
        if dept: tags.append(dept)
        if emp_type: tags.append(emp_type)
        
        posted = j.get("first_published") or j.get("updated_at")
        
        results.append({
            "title": title,
            "company": j.get("company_name", slug),
            "location": loc or None,
            "country": detect_country(loc),
            "region": None,
            "remote": job_type == "remote",
            "job_type": job_type,
            "experience_level": detect_experience_level(title),
            "url": j.get("absolute_url", f"https://boards.greenhouse.io/{slug}"),
            "description": desc,
            "salary_range": None,
            "tags": tags,
            "posted_date": posted or datetime.utcnow().isoformat(),
            "source": "greenhouse",
            "source_id": str(j.get("id", "")),
        })
    
    return results


async def fetch_lever(slug: str) -> List[Dict[str, Any]]:
    resp = await safe_fetch(f"https://api.lever.co/v0/postings/{slug}?mode=json")
    if not resp:
        return []
    
    try:
        data = resp.json()
    except:
        return []
    
    if not isinstance(data, list):
        return []
    
    jobs = data[:PER_COMPANY_MAX]
    results = []
    
    for j in jobs:
        loc = j.get("categories", {}).get("location", "")
        desc = (j.get("descriptionPlain") or "")[:4000]
        job_type = detect_job_type(loc, desc)
        title = j.get("text") or "Untitled role"
        tags = []
        cats = j.get("categories", {})
        if cats.get("department"): tags.append(cats["department"])
        if cats.get("team"): tags.append(cats["team"])
        if cats.get("commitment"): tags.append(cats["commitment"])
        
        results.append({
            "title": title,
            "company": slug,
            "location": loc or None,
            "country": detect_country(loc),
            "region": None,
            "remote": job_type == "remote",
            "job_type": job_type,
            "experience_level": detect_experience_level(title),
            "url": j.get("hostedUrl", f"https://jobs.lever.co/{slug}"),
            "description": desc,
            "salary_range": None,
            "tags": tags,
            "posted_date": datetime.fromtimestamp(j["createdAt"]/1000).isoformat() if j.get("createdAt") else datetime.utcnow().isoformat(),
            "source": "lever",
            "source_id": j.get("id", ""),
        })
    
    return results


async def fetch_ashby(slug: str) -> List[Dict[str, Any]]:
    resp = await safe_fetch(f"https://api.ashbyhq.com/posting-api/job-board/{slug}")
    if not resp:
        return []
    
    try:
        data = resp.json()
    except:
        return []
    
    jobs = data.get("jobs", [])[:PER_COMPANY_MAX]
    results = []
    
    for j in jobs:
        loc = j.get("location", "")
        desc_plain = j.get("descriptionPlain") or ""
        desc_html = strip_html(j.get("descriptionHtml") or "") if j.get("descriptionHtml") else ""
        desc = (desc_plain or desc_html)[:4000]
        job_type = detect_job_type(loc, desc, j.get("isRemote", False))
        title = j.get("title") or "Untitled role"
        tags = []
        if j.get("department"): tags.append(j["department"])
        if j.get("team"): tags.append(j["team"])
        if j.get("employmentType"): tags.append(j["employmentType"])
        
        results.append({
            "title": title,
            "company": slug,
            "location": loc or None,
            "country": detect_country(loc),
            "region": None,
            "remote": j.get("isRemote", False) or job_type == "remote",
            "job_type": job_type,
            "experience_level": detect_experience_level(title),
            "url": j.get("externalLink") or j.get("applyUrl") or j.get("jobUrl") or f"https://jobs.ashbyhq.com/{slug}",
            "description": desc,
            "salary_range": None,
            "tags": tags,
            "posted_date": j.get("publishedAt") or datetime.utcnow().isoformat(),
            "source": "ashby",
            "source_id": j.get("id", ""),
        })
    
    return results


async def fetch_one(company: Dict[str, Any]) -> List[Dict[str, Any]]:
    try:
        ats = company.get("ats")
        slug = company.get("slug")
        if ats == "greenhouse":
            return await fetch_greenhouse(slug)
        elif ats == "lever":
            return await fetch_lever(slug)
        elif ats == "ashby":
            return await fetch_ashby(slug)
    except Exception as e:
        logger.warning(f"ATS fetch failed for {company.get('ats')}/{company.get('slug')}: {e}")
    return []


async def fetch_ats_jobs(companies: List[Dict[str, Any]] = ATS_COMPANIES) -> List[Dict[str, Any]]:
    """Fetch jobs from all ATS companies with bounded concurrency"""
    import asyncio
    out = []
    
    for i in range(0, len(companies), ATS_CONCURRENCY):
        chunk = companies[i:i + ATS_CONCURRENCY]
        tasks = [fetch_one(c) for c in chunk]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for r in results:
            if isinstance(r, list):
                out.extend(r)
            elif isinstance(r, Exception):
                logger.warning(f"ATS fetch error: {r}")
    
    return out


# Import at bottom
from datetime import datetime