"""Claude (Anthropic) as a bring-your-own-key provider, through the official Anthropic SDK."""

import anthropic

from app.services.llm_types import (
    Completion,
    LLMAuthError,
    LLMError,
    LLMModelError,
    LLMRateLimitError,
)

FAST_MODELS = ["claude-haiku-5-5"]
QUALITY_MODELS = ["claude-opus-5-5"]

# Models that accept the server-side refusal fallback ("default" routes by refusal category).
_FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}

# Thinking is on by default on current Claude models and counts toward max_tokens, so give
# every call room; the user pays only for tokens actually generated.
_MAX_TOKENS = 16000


def _client(api_key: str) -> anthropic.AsyncAnthropic:
    # api_key is always passed explicitly: the SDK must never fall back to credentials in the
    # server's environment when running a user's request.
    return anthropic.AsyncAnthropic(api_key=api_key, timeout=120.0, max_retries=1)


def _raise_mapped(e: Exception) -> None:
    if isinstance(e, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
        raise LLMAuthError("anthropic", str(e)) from None
    if isinstance(e, anthropic.RateLimitError):
        raise LLMRateLimitError("anthropic", str(e)) from None
    if isinstance(e, anthropic.NotFoundError):
        raise LLMModelError("anthropic", str(e)) from None
    if isinstance(e, anthropic.APIStatusError):
        raise LLMError("anthropic", f"HTTP {e.status_code}: {e.message}") from None
    if isinstance(e, anthropic.APIConnectionError):
        raise LLMError("anthropic", "Couldn't reach Anthropic.") from None
    raise e


async def complete(api_key: str, model: str, system: str | None, prompt: str, *, fast: bool) -> Completion:
    params: dict = {
        "model": model,
        "max_tokens": _MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}],
        # Scoring is a short classification; the writing tasks need a little more care.
        "output_config": {"effort": "low" if fast else "medium"},
    }
    if system:
        params["system"] = system

    client = _client(api_key)
    try:
        if model in _FALLBACK_MODELS:
            # On a safety decline, the API reruns the request on a suitable fallback model.
            response = await client.beta.messages.create(
                **params, betas=["server-side-fallback-2026-07-01"], fallbacks="default"
            )
        else:
            response = await client.messages.create(**params)
    except Exception as e:  # noqa: BLE001 - mapped to provider-neutral errors
        _raise_mapped(e)
        raise
    finally:
        await client.close()

    if response.stop_reason == "refusal":
        raise LLMError("anthropic", "Claude declined this request.")
    text = "".join(block.text for block in response.content if block.type == "text")
    usage = response.usage
    tokens = (usage.input_tokens or 0) + (usage.output_tokens or 0) if usage else 0
    return Completion(text=text, tokens=tokens, model=model)


async def list_models(api_key: str) -> list[str]:
    client = _client(api_key)
    try:
        return [m.id async for m in client.models.list()]
    except Exception as e:  # noqa: BLE001
        _raise_mapped(e)
        raise
    finally:
        await client.close()
