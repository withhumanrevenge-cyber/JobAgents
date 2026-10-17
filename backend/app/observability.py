"""Error reporting. Off unless SENTRY_DSN is set, so local runs and tests send nothing."""

import sentry_sdk

from app.config import get_settings


def init_sentry() -> None:
    s = get_settings()
    if not s.SENTRY_DSN:
        return
    sentry_sdk.init(
        dsn=s.SENTRY_DSN,
        environment=s.ENVIRONMENT,
        # Errors only: resumes, keys and emails pass through requests, so no request bodies,
        # no user IPs, and no performance tracing until there's a reason to pay for it.
        send_default_pii=False,
        traces_sample_rate=0.0,
    )
