from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from typing_extensions import Annotated


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENVIRONMENT: str = "development"

    # Frontend origin: used for CORS, email links and checkout redirects.
    APP_URL: str = "http://localhost:3000"
    # Extra CORS origins (comma-separated), e.g. Vercel preview URLs.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = []

    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Hosted AI (paid plans and the Free trial) runs on our Groq key.
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_FAST_MODEL: str = "openai/gpt-oss-20b"

    # Fernet key(s) for users' own AI keys at rest, comma-separated, newest first.
    BYOK_ENCRYPTION_KEY: str = ""

    ADZUNA_APP_ID: str = ""
    ADZUNA_APP_KEY: str = ""

    RESEND_API_KEY: str = ""
    RESEND_FROM: str = "JobAgent <onboarding@resend.dev>"

    # Required for /api/cron/sync. Empty means the endpoint refuses every call.
    CRON_SECRET: str = ""

    # Admin access needs BOTH an allowlisted email and profiles.is_admin.
    ADMIN_EMAILS: Annotated[list[str], NoDecode] = []

    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    RAZORPAY_PRO_PLAN_ID: str = ""
    RAZORPAY_PREMIUM_PLAN_ID: str = ""

    LEMONSQUEEZY_API_KEY: str = ""
    LEMONSQUEEZY_STORE_ID: str = ""
    LEMONSQUEEZY_PRO_VARIANT_ID: str = ""
    LEMONSQUEEZY_PREMIUM_VARIANT_ID: str = ""
    LEMONSQUEEZY_WEBHOOK_SECRET: str = ""

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip().rstrip("/") for o in v.split(",") if o.strip()]
        return v

    @field_validator("ADMIN_EMAILS", mode="before")
    @classmethod
    def _split_emails(cls, v: object) -> object:
        if isinstance(v, str):
            return [e.strip().lower() for e in v.split(",") if e.strip()]
        return v

    @field_validator("APP_URL")
    @classmethod
    def _strip_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def allowed_origins(self) -> list[str]:
        return list(dict.fromkeys([self.APP_URL, *self.CORS_ORIGINS]))


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
