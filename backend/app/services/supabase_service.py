# backend/app/services/supabase_service.py
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.core.database import get_service_supabase, get_supabase
import logging

logger = logging.getLogger(__name__)


class SupabaseService:
    def __init__(self, use_service_role: bool = False):
        self.client = get_service_supabase() if use_service_role else get_supabase()

    # Profile operations
    async def get_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        result = self.client.table("profiles").select("*").eq("user_id", user_id).single().execute()
        return result.data if result.data else None

    async def upsert_profile(self, profile_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        profile_data["updated_at"] = datetime.utcnow().isoformat()
        result = self.client.table("profiles").upsert(profile_data, on_conflict="user_id").execute()
        return result.data[0] if result.data else None

    async def create_profile(self, profile_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        result = self.client.table("profiles").insert(profile_data).execute()
        return result.data[0] if result.data else None

    # Job operations
    async def upsert_jobs(self, jobs: List[Dict[str, Any]]) -> Dict[str, int]:
        if not jobs:
            return {"fetched": 0, "new": 0, "duplicates": 0}

        result = self.client.table("jobs").upsert(
            jobs, on_conflict="source,source_id", ignore_duplicates=True
        ).execute()
        
        new_count = len(result.data) if result.data else 0
        return {
            "fetched": len(jobs),
            "new": new_count,
            "duplicates": len(jobs) - new_count
        }

    async def get_jobs_for_matching(
        self,
        sources: List[str],
        country: Optional[str] = None,
        limit_per_source: int = 400
    ) -> List[Dict[str, Any]]:
        all_jobs = []
        for source in sources:
            query = self.client.table("jobs").select(
                "id,title,company,location,tags,description,posted_date,source,country"
            ).eq("source", source).order("posted_date", desc=True).limit(limit_per_source)
            
            if country:
                query = query.in_("country", [country, "Worldwide"])
            
            result = query.execute()
            all_jobs.extend(result.data or [])
        
        return all_jobs

    async def get_job_by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        result = self.client.table("jobs").select("*").eq("id", job_id).single().execute()
        return result.data if result.data else None

    # Match operations
    async def get_matched_job_ids(self, user_id: str) -> set:
        matched_ids = set()
        page_size = 1000
        offset = 0
        
        while True:
            result = self.client.table("matches").select("job_id").eq("user_id", user_id).range(offset, offset + page_size - 1).execute()
            if not result.data:
                break
            for match in result.data:
                matched_ids.add(match["job_id"])
            if len(result.data) < page_size:
                break
            offset += page_size
        
        return matched_ids

    async def upsert_match(self, match_data: Dict[str, Any]) -> bool:
        result = self.client.table("matches").upsert(
            match_data, on_conflict="user_id,job_id", ignore_duplicates=True
        ).execute()
        return bool(result.data)

    async def get_user_matches(
        self,
        user_id: str,
        min_score: Optional[int] = None,
        since: Optional[datetime] = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        query = self.client.table("matches").select("*, job:jobs(*)").eq("user_id", user_id)
        
        if min_score is not None:
            query = query.gte("match_score", min_score)
        if since:
            query = query.gte("created_at", since.isoformat())
        
        result = query.order("match_score", desc=True).limit(limit).execute()
        return result.data or []

    async def update_match(self, user_id: str, job_id: str, updates: Dict[str, Any]) -> bool:
        result = self.client.table("matches").update(updates).eq("user_id", user_id).eq("job_id", job_id).execute()
        return bool(result.data)

    async def insert_match(self, match_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        result = self.client.table("matches").insert(match_data).execute()
        return result.data[0] if result.data else None

    # Usage events
    async def log_usage(self, user_id: str, action: str, credits: int, tokens: int = 0, model: Optional[str] = None) -> None:
        self.client.table("usage_events").insert({
            "user_id": user_id,
            "action": action,
            "credits": credits,
            "tokens": tokens,
            "model": model
        }).execute()

    async def get_credits_used_this_month(self, user_id: str) -> int:
        start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        result = self.client.table("usage_events").select("credits").eq("user_id", user_id).gte("created_at", start_of_month.isoformat()).execute()
        return sum(event.get("credits", 0) for event in (result.data or []))

    async def consume_credits_rpc(self, user_id: str, action: str, cost: int, allotment: int) -> bool:
        """Call the consume_credits PostgreSQL function"""
        try:
            result = self.client.rpc("consume_credits", {
                "p_user_id": user_id,
                "p_action": action,
                "p_cost": cost,
                "p_allotment": allotment
            }).execute()
            return result.data == True
        except Exception as e:
            logger.warning(f"consume_credits RPC failed: {e}")
            return False

    async def refund_last_usage(self, user_id: str, action: str) -> None:
        start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        result = self.client.table("usage_events").select("id").eq("user_id", user_id).eq("action", action).gte("created_at", start_of_month.isoformat()).order("created_at", desc=True).limit(1).execute()
        
        if result.data:
            self.client.table("usage_events").delete().eq("id", result.data[0]["id"]).execute()

    # Storage
    async def upload_resume(self, user_id: str, file_content: bytes, filename: str) -> Optional[str]:
        file_path = f"{user_id}/resume_{int(datetime.utcnow().timestamp())}.pdf"
        result = self.client.storage.from_("resumes").upload(
            file_path, file_content, {"content-type": "application/pdf", "upsert": "true"}
        )
        return file_path if not result.get("error") else None

    async def create_signed_resume_url(self, user_id: str, stored_path: str, expires_in: int = 300) -> Optional[str]:
        # Normalize path
        if "/resumes/" in stored_path:
            path = stored_path.split("/resumes/")[1].split("?")[0]
        else:
            path = stored_path
        
        # Verify ownership
        if not path.startswith(f"{user_id}/"):
            return None
        
        result = self.client.storage.from_("resumes").create_signed_url(path, expires_in)
        return result.get("signedURL") if result.get("signedURL") else None

    # Admin operations
    async def get_all_profiles(self, limit: int = 500) -> List[Dict[str, Any]]:
        result = self.client.table("profiles").select("*").order("created_at", desc=True).limit(limit).execute()
        return result.data or []

    async def get_usage_events_since(self, since: datetime) -> List[Dict[str, Any]]:
        result = self.client.table("usage_events").select("user_id,action,tokens,credits,created_at").gte("created_at", since.isoformat()).execute()
        return result.data or []

    async def set_user_plan(self, user_id: str, plan: str, expires_at: Optional[datetime] = None) -> bool:
        result = self.client.table("profiles").update({
            "plan": plan,
            "plan_expires_at": expires_at.isoformat() if expires_at else None
        }).eq("user_id", user_id).execute()
        return bool(result.data)

    # Webhook idempotency
    async def check_webhook_processed(self, provider: str, event_id: str) -> bool:
        result = self.client.table("webhook_events").select("id").eq("provider", provider).eq("event_id", event_id).single().execute()
        return result.data is not None

    async def record_webhook_event(self, provider: str, event_id: str, event_type: str, payload: Dict[str, Any]) -> None:
        self.client.table("webhook_events").insert({
            "provider": provider,
            "event_id": event_id,
            "event_type": event_type,
            "payload": payload
        }).execute()

    # Hiring
    async def create_job_posting(self, posting_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        result = self.client.table("job_postings").insert(posting_data).execute()
        return result.data[0] if result.data else None

    async def get_job_postings(self, recruiter_id: str) -> List[Dict[str, Any]]:
        result = self.client.table("job_postings").select("*").eq("recruiter_id", recruiter_id).order("created_at", desc=True).execute()
        postings = result.data or []
        
        # Get candidate counts
        if postings:
            ids = [p["id"] for p in postings]
            counts_result = self.client.table("candidate_matches").select("posting_id").in_("posting_id", ids).execute()
            counts = {}
            for cm in counts_result.data or []:
                counts[cm["posting_id"]] = counts.get(cm["posting_id"], 0) + 1
            
            for p in postings:
                p["candidate_count"] = counts.get(p["id"], 0)
        
        return postings

    async def get_job_posting(self, posting_id: str) -> Optional[Dict[str, Any]]:
        result = self.client.table("job_postings").select("*").eq("id", posting_id).single().execute()
        return result.data if result.data else None

    async def match_candidates_for_posting(
        self,
        posting_id: str,
        candidate_ids: List[str]
    ) -> List[Dict[str, Any]]:
        # Get existing matches
        existing = self.client.table("candidate_matches").select("candidate_id").eq("posting_id", posting_id).execute()
        done = set(cm["candidate_id"] for cm in (existing.data or []))
        
        pending = [cid for cid in candidate_ids if cid not in done]
        return pending

    async def insert_candidate_match(self, match_data: Dict[str, Any]) -> bool:
        result = self.client.table("candidate_matches").insert(match_data).execute()
        return bool(result.data)

    async def get_candidates_for_posting(self, posting_id: str) -> List[Dict[str, Any]]:
        result = self.client.table("candidate_matches").select("*").eq("posting_id", posting_id).order("match_score", desc=True).execute()
        return result.data or []

    async def get_profiles_for_candidates(self, candidate_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not candidate_ids:
            return {}
        result = self.client.table("profiles").select("user_id,full_name,email,linkedin_url,parsed_resume,open_to_work").in_("user_id", candidate_ids).execute()
        profiles = {}
        for p in result.data or []:
            if p.get("open_to_work"):
                profiles[p["user_id"]] = {
                    "full_name": p["full_name"],
                    "email": p["email"],
                    "linkedin_url": p["linkedin_url"],
                    "parsed_resume": p["parsed_resume"]
                }
        return profiles


# Singleton instance
supabase_service = SupabaseService(use_service_role=True)