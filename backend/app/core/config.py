# backend/app/core/config.py
import os
from functools import lru_cache
from typing import List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # App
    APP_NAME: str = "JobAgent API"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = Field(default="development", validation_alias="ENVIRONMENT")
    DEBUG: bool = Field(default=True, validation_alias="DEBUG")
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = Field(validation_alias="SECRET_KEY")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000"],
        validation_alias="BACKEND_CORS_ORIGINS"
    )

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | List[str]) -> List[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    # Supabase
    SUPABASE_URL: str = Field(validation_alias="SUPABASE_URL")
    SUPABASE_ANON_KEY: str = Field(validation_alias="SUPABASE_ANON_KEY")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(validation_alias="SUPABASE_SERVICE_ROLE_KEY")

    # Groq
    GROQ_API_KEY: str = Field(validation_alias="GROQ_API_KEY")
    GROQ_FAST_MODEL: str = "openai/gpt-oss-20b"
    GROQ_QUALITY_MODEL: str = "openai/gpt-oss-120b"

    # Job Sources
    ADZUNA_APP_ID: Optional[str] = Field(default=None, validation_alias="ADZUNA_APP_ID")
    ADZUNA_APP_KEY: Optional[str] = Field(default=None, validation_alias="ADZUNA_APP_KEY")

    # Email (Resend)
    RESEND_API_KEY: Optional[str] = Field(default=None, validation_alias="RESEND_API_KEY")
    RESEND_FROM: Optional[str] = Field(default=None, validation_alias="RESEND_FROM")

    # Cron
    CRON_SECRET: str = Field(validation_alias="CRON_SECRET")

    # Razorpay (India / INR)
    RAZORPAY_KEY_ID: Optional[str] = Field(default=None, validation_alias="RAZORPAY_KEY_ID")
    RAZORPAY_KEY_SECRET: Optional[str] = Field(default=None, validation_alias="RAZORPAY_KEY_SECRET")
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = Field(default=None, validation_alias="RAZORPAY_WEBHOOK_SECRET")
    RAZORPAY_PRO_PLAN_ID: Optional[str] = Field(default=None, validation_alias="RAZORPAY_PRO_PLAN_ID")
    RAZORPAY_PREMIUM_PLAN_ID: Optional[str] = Field(default=None, validation_alias="RAZORPAY_PREMIUM_PLAN_ID")

    # Lemon Squeezy (International / USD)
    LEMONSQUEEZY_API_KEY: Optional[str] = Field(default=None, validation_alias="LEMONSQUEEZY_API_KEY")
    LEMONSQUEEZY_STORE_ID: Optional[str] = Field(default=None, validation_alias="LEMONSQUEEZY_STORE_ID")
    LEMONSQUEEZY_PRO_VARIANT_ID: Optional[str] = Field(default=None, validation_alias="LEMONSQUEEZY_PRO_VARIANT_ID")
    LEMONSQUEEZY_PREMIUM_VARIANT_ID: Optional[str] = Field(default=None, validation_alias="LEMONSQUEEZY_PREMIUM_VARIANT_ID")
    LEMONSQUEEZY_WEBHOOK_SECRET: Optional[str] = Field(default=None, validation_alias="LEMONSQUEEZY_WEBHOOK_SECRET")

    # Admin
    ADMIN_EMAILS: List[str] = Field(default=[], validation_alias="ADMIN_EMAILS")

    @field_validator("ADMIN_EMAILS", mode="before")
    @classmethod
    def parse_admin_emails(cls, v: str | List[str]) -> List[str]:
        if isinstance(v, str):
            return [email.strip().lower() for email in v.split(",") if email.strip()]
        return [email.lower() for email in v]

    # Database (for direct SQLAlchemy access if needed)
    DATABASE_URL: Optional[str] = Field(default=None, validation_alias="DATABASE_URL")

    # Redis (for rate limiting, queues)
    REDIS_URL: Optional[str] = Field(default=None, validation_alias="REDIS_URL")

    # Sentry
    SENTRY_DSN: Optional[str] = Field(default=None, validation_alias="SENTRY_DSN")

    # Rate Limiting
    RATE_LIMIT_AI_REQUESTS_PER_MINUTE: int = 10
    RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE: int = 5
    RATE_LIMIT_GENERAL_REQUESTS_PER_MINUTE: int = 60

    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # File Upload
    MAX_FILE_SIZE_MB: int = 10
    ALLOWED_FILE_TYPES: List[str] = ["application/pdf"]

    # AI Token Limits
    MAX_RESUME_TOKENS: int = 6000
    MAX_JOB_DESCRIPTION_TOKENS: int = 2500

    # Feature Flags
    ENABLE_HIRING: bool = True
    ENABLE_ADMIN: bool = True
    ENABLE_EMAIL_DIGESTS: bool = True

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()