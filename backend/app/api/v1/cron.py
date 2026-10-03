# backend/app/api/v1/cron.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from app.core.security import get_current_user
from app.services.supabase_service import supabase_service
from app.agents.job_fetcher import sync_all_jobs, DEFAULT_QUERIES
from app.agents.matching_agent import match_jobs_for_user
from app.services.email_service import send_match_digest
from app.schemas.job import Match
from app.core.config import settings
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cron", tags=["cron"])


async def verify_cron_secret(request: Request):
    """Verify cron secret from Authorization header"""
    cron_secret = settings.CRON_SECRET
    if not cron_secret:
        raise HTTPException(status_code=503, detail="Cron is not configured")
    
    auth_header = request.headers.get("Authorization")
    if auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/sync")
async def cron_sync(request: Request, _: None = Depends(verify_cron_secret)):
    """Scheduled job: sync jobs, match for users, send digests"""
    started_at = datetime.utcnow()
    logger.info("Starting cron sync job")
    
    try:
        # Get all profiles for query/country pools
        profiles = await supabase_service.get_all_profiles(limit=5000)
        all_profiles = profiles or []
        
        query_pool = set()
        country_pool = set()
        
        for p in all_profiles:
            explicit = [t for t in (p.get("target_roles") or []) if t]
            if explicit:
                query_pool.update(explicit)
            elif p.get("parsed_resume", {}).get("target_role"):
                query_pool.add(p["parsed_resume"]["target_role"])
            
            if p.get("target_country"):
                country_pool.add(p["target_country"])
        
        queries = list(query_pool)[:6] if query_pool else None
        countries = list(country_pool)[:3] if country_pool else None
        
        # Sync jobs
        logger.info(f"Syncing jobs for queries: {queries}, countries: {countries}")
        fetch_stats = await sync_all_jobs(queries, countries, adzuna_pages=3)
        
        # Additional rotation if time permits
        elapsed = (datetime.utcnow() - started_at).total_seconds()
        if elapsed < 25:
            day = int(datetime.utcnow().timestamp() // 86400)
            rotation = [DEFAULT_QUERIES[(day * 4 + i) % len(DEFAULT_QUERIES)] for i in range(4)]
            await sync_all_jobs(rotation, ["IN"], sources=["adzuna"], adzuna_pages=2)
        
        # Match jobs for users with email notifications
        target_profiles = [p for p in all_profiles if p.get("email_notifications")]
        
        match_stats = {}
        email_stats = {"sent": 0, "skipped": 0, "failed": 0}
        
        for profile in target_profiles:
            if (datetime.utcnow() - started_at).total_seconds() > 45:
                break
            
            try:
                user_id = profile["user_id"]
                stats = await match_jobs_for_user(user_id, limit=20)
                match_stats[user_id] = stats
                
                if not profile.get("email_notifications") or not profile.get("email") or stats["matched"] == 0:
                    email_stats["skipped"] += 1
                    continue
                
                # Get fresh matches for digest
                since = datetime.utcnow() - timedelta(days=1)
                matches = await supabase_service.get_user_matches(
                    user_id,
                    min_score=profile.get("match_threshold", 70),
                    since=since,
                    limit=20
                )
                
                if not matches:
                    email_stats["skipped"] += 1
                    continue
                
                result = await send_match_digest(
                    to=profile["email"],
                    name=profile.get("full_name", ""),
                    matches=matches
                )
                
                if result["sent"]:
                    email_stats["sent"] += 1
                else:
                    email_stats["failed"] += 1
                    logger.warning(f"Digest email failed for {user_id}: {result.get('reason')}")
                    
            except Exception as e:
                logger.error(f"Cron processing failed for user {profile.get('user_id')}: {e}")
        
        return {
            "success": True,
            "jobSync": fetch_stats,
            "matchingSync": match_stats,
            "emailSync": email_stats,
            "duration_seconds": (datetime.utcnow() - started_at).total_seconds()
        }
        
    except Exception as e:
        logger.error(f"Cron orchestrator failed: {e}")
        raise HTTPException(status_code=500, detail="Cron sync pipeline failed")


from datetime import timedelta