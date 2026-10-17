from dataclasses import dataclass


@dataclass
class Completion:
    text: str
    tokens: int
    model: str


class LLMError(Exception):
    """A provider call failed. Messages never include the API key."""

    def __init__(self, provider: str, detail: str) -> None:
        super().__init__(detail)
        self.provider = provider
        self.detail = detail


class LLMAuthError(LLMError):
    """The key was rejected (invalid, revoked, or lacks access)."""


class LLMRateLimitError(LLMError):
    """Rate limited or out of quota on this key."""


class LLMModelError(LLMError):
    """The model doesn't exist or this key can't use it."""
