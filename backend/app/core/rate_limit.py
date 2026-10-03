# backend/app/core/rate_limit.py
import time
from typing import Optional
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import redis.asyncio as redis
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class RateLimiter:
    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or settings.REDIS_URL
        self._redis: Optional[redis.Redis] = None
        self.local_cache: dict = {}  # Fallback for development

    async def get_redis(self) -> Optional[redis.Redis]:
        if self._redis is None and self.redis_url:
            try:
                self._redis = redis.from_url(self.redis_url, decode_responses=True)
            except Exception as e:
                logger.warning(f"Failed to connect to Redis: {e}. Using in-memory fallback.")
        return self._redis

    async def limit(
        self,
        key: str,
        limit: int,
        window_seconds: int
    ) -> tuple[bool, int, int, int]:
        """
        Returns (success, limit, remaining, reset_time)
        """
        r = await self.get_redis()
        now = time.time()
        window_start = now - window_seconds

        if r:
            # Use Redis sliding window
            pipe = r.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, window_seconds + 1)
            results = await pipe.execute()
            current_count = results[1]
        else:
            # In-memory fallback
            if key not in self.local_cache:
                self.local_cache[key] = []
            
            # Clean old entries
            self.local_cache[key] = [ts for ts in self.local_cache[key] if ts > window_start]
            current_count = len(self.local_cache[key])
            
            if current_count < limit:
                self.local_cache[key].append(now)

        remaining = max(0, limit - current_count)
        reset_time = int(now + window_seconds)
        success = current_count < limit

        return success, limit, remaining, reset_time


# Global rate limiter instance
rate_limiter = RateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/healthz", "/ready"]:
            return await call_next(request)

        # Get client IP
        client_ip = request.client.host if request.client else "unknown"
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

        # Determine rate limit based on path
        path = request.url.path

        if path.startswith("/api/v1/ai/") or path in [
            "/api/v1/apply/smart",
            "/api/v1/interview/generate",
            "/api/v1/resume/tailor",
            "/api/v1/match",
            "/api/v1/jobs/fetch",
        ]:
            limit = settings.RATE_LIMIT_AI_REQUESTS_PER_MINUTE
            window = 60
            key_prefix = "ai"
        elif path.startswith("/api/v1/auth/"):
            limit = settings.RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE
            window = 60
            key_prefix = "auth"
        else:
            limit = settings.RATE_LIMIT_GENERAL_REQUESTS_PER_MINUTE
            window = 60
            key_prefix = "general"

        key = f"ratelimit:{key_prefix}:{client_ip}"
        success, limit, remaining, reset = await rate_limiter.limit(key, limit, window)

        # Add rate limit headers
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset)

        if not success:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"error": "Rate limit exceeded. Please try again later."},
                headers={
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset),
                    "Retry-After": str(window),
                },
            )

        return response