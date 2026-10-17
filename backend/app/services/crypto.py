"""Encryption for users' AI provider keys at rest.

BYOK_ENCRYPTION_KEY holds one or more Fernet keys, comma-separated, newest first. New values
are encrypted with the first; any listed key decrypts, so a key can be rotated by prepending
a new one and re-saving (or letting users re-save) before removing the old one.

Generate a key with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.config import get_settings
from app.errors import ApiError


def _fernet() -> MultiFernet:
    raw = [k.strip() for k in get_settings().BYOK_ENCRYPTION_KEY.split(",") if k.strip()]
    if not raw:
        raise ApiError(503, "Saving your own AI key isn't available right now.")
    return MultiFernet([Fernet(k.encode()) for k in raw])


def encrypt(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt(token: str) -> str | None:
    """The plaintext, or None if no configured key can decrypt it (e.g. the key was rotated out)."""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def hint(secret: str) -> str:
    """What the UI shows instead of the key: its last four characters."""
    return f"…{secret[-4:]}" if len(secret) > 8 else "…"
