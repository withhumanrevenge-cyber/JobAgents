# backend/app/core/database.py
from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class SupabaseClient:
    _instance: Client = None
    _service_instance: Client = None

    @classmethod
    def get_client(cls) -> Client:
        """Get the anon client for user-facing operations (with RLS)"""
        if cls._instance is None:
            cls._instance = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_ANON_KEY
            )
        return cls._instance

    @classmethod
    def get_service_client(cls) -> Client:
        """Get the service role client for admin operations (bypasses RLS)"""
        if cls._service_instance is None:
            cls._service_instance = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_ROLE_KEY
            )
        return cls._service_instance


# Convenience functions
def get_supabase() -> Client:
    return SupabaseClient.get_client()


def get_service_supabase() -> Client:
    return SupabaseClient.get_service_client()