"""Provider-neutral LLM calls.

Groq, OpenAI, Google Gemini and OpenRouter are called through their OpenAI-compatible chat
endpoints; Claude goes through the Anthropic SDK (llm_anthropic). Base URLs are fixed per
provider, never user-supplied, so a saved key can't be pointed at an arbitrary host."""

import json
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.services import llm_anthropic
from app.services.llm_types import (
    Completion,
    LLMAuthError,
    LLMError,
    LLMModelError,
    LLMRateLimitError,
)

__all__ = ["PROVIDERS", "Completion", "LLMAuthError", "LLMError", "LLMModelError", "LLMRateLimitError",
           "complete", "list_models", "pick_defaults", "parse_json"]


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    key_url: str
    note: str
    fast_prefs: list[str] = field(default_factory=list)
    quality_prefs: list[str] = field(default_factory=list)
    base_url: str = ""  # OpenAI-compatible providers only


PROVIDERS: dict[str, Provider] = {
    "groq": Provider(
        "groq", "Groq", "https://console.groq.com/keys",
        "Free key, very fast. Recommended if you don't have a key yet.",
        ["openai/gpt-oss-20b", "llama-3.1-8b-instant"],
        ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
        "https://api.groq.com/openai/v1",
    ),
    "gemini": Provider(
        "gemini", "Google Gemini", "https://aistudio.google.com/apikey",
        "Free tier available from Google AI Studio.",
        ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"],
        ["gemini-2.5-pro", "gemini-2.5-flash"],
        "https://generativelanguage.googleapis.com/v1beta/openai",
    ),
    "openai": Provider(
        "openai", "OpenAI", "https://platform.openai.com/api-keys",
        "Paid usage on your OpenAI account.",
        ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"],
        ["gpt-5", "gpt-4.1", "gpt-4o"],
        "https://api.openai.com/v1",
    ),
    "anthropic": Provider(
        "anthropic", "Anthropic (Claude)", "https://console.anthropic.com/settings/keys",
        "Paid usage on your Anthropic account.",
        llm_anthropic.FAST_MODELS, llm_anthropic.QUALITY_MODELS,
    ),
    "openrouter": Provider(
        "openrouter", "OpenRouter", "https://openrouter.ai/keys",
        "One key for hundreds of models, including some free ones.",
        ["openai/gpt-oss-20b", "google/gemini-2.5-flash"],
        ["openai/gpt-oss-120b", "google/gemini-2.5-pro"],
        "https://openrouter.ai/api/v1",
    ),
}

# Model ids that aren't chat models (speech, images, embeddings, moderation).
_NOT_CHAT = re.compile(r"whisper|tts|transcri|embed|image|imagen|dall-e|audio|realtime|moderation|guard|aqa|veo|search", re.I)


def _headers(provider: str, api_key: str) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {api_key}"}
    if provider == "openrouter":
        headers["X-Title"] = "JobAgent"
    return headers


def _raise_for(provider: str, res: httpx.Response) -> None:
    if res.status_code < 400:
        return
    try:
        body = res.json()
        err = body[0] if isinstance(body, list) else body
        message = str((err.get("error") or {}).get("message") or err.get("message") or "")
    except (ValueError, AttributeError, IndexError):
        message = ""
    detail = f"HTTP {res.status_code}{': ' + message[:200] if message else ''}"
    # Gemini answers a bad key with 400 "API key not valid".
    if res.status_code in (401, 403) or (res.status_code == 400 and "api key" in message.lower()):
        raise LLMAuthError(provider, detail)
    if res.status_code == 429 or res.status_code == 402:
        raise LLMRateLimitError(provider, detail)
    if res.status_code == 404 or (res.status_code == 400 and "model" in message.lower()):
        raise LLMModelError(provider, detail)
    raise LLMError(provider, detail)


async def _openai_compatible(provider: Provider, api_key: str, model: str, system: str | None,
                             prompt: str, max_tokens: int) -> Completion:
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    body: dict[str, Any] = {"model": model, "messages": messages}
    if provider.id == "openai":
        # Newer OpenAI models reject max_tokens and non-default temperature.
        body["max_completion_tokens"] = max_tokens
    else:
        body["max_tokens"] = max_tokens
        body["temperature"] = 0.3
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            res = await client.post(f"{provider.base_url}/chat/completions", headers=_headers(provider.id, api_key), json=body)
    except httpx.HTTPError:
        raise LLMError(provider.id, f"Couldn't reach {provider.label}.") from None
    _raise_for(provider.id, res)
    data = res.json()
    choices = data.get("choices") or []
    text = ((choices[0].get("message") or {}).get("content") or "") if choices else ""
    tokens = int((data.get("usage") or {}).get("total_tokens") or 0)
    return Completion(text=text, tokens=tokens, model=model)


async def complete(provider_id: str, api_key: str, model: str, system: str | None, prompt: str,
                   *, fast: bool = False) -> Completion:
    provider = PROVIDERS[provider_id]
    if provider_id == "anthropic":
        return await llm_anthropic.complete(api_key, model, system, prompt, fast=fast)
    # Reasoning models spend part of the budget thinking, so leave headroom beyond the answer.
    return await _openai_compatible(provider, api_key, model, system, prompt, 2000 if fast else 6000)


async def list_models(provider_id: str, api_key: str) -> list[str]:
    """Chat models this key can use. Doubles as the key check: an invalid key raises LLMAuthError."""
    provider = PROVIDERS[provider_id]
    if provider_id == "anthropic":
        return await llm_anthropic.list_models(api_key)
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            if provider_id == "openrouter":
                # OpenRouter's model list is public; check the key separately.
                _raise_for(provider_id, await client.get(f"{provider.base_url}/key", headers=_headers(provider_id, api_key)))
            res = await client.get(f"{provider.base_url}/models", headers=_headers(provider_id, api_key))
    except httpx.HTTPError:
        raise LLMError(provider_id, f"Couldn't reach {provider.label}.") from None
    _raise_for(provider_id, res)
    ids = [str(m.get("id", "")).removeprefix("models/") for m in (res.json().get("data") or [])]
    return sorted({i for i in ids if i and not _NOT_CHAT.search(i)})


_FAST_HINTS = ("flash-lite", "flash", "mini", "haiku", "20b", "8b", "small", "instant")
_QUALITY_HINTS = ("opus", "sonnet", "pro", "120b", "70b", "gpt-5", "gpt-4.1", "large")


def _pick(models: list[str], prefs: list[str], hints: tuple[str, ...]) -> str | None:
    available = set(models)
    for model in prefs:
        if model in available:
            return model
    for hint in hints:
        for model in models:
            if hint in model.lower():
                return model
    return models[0] if models else None


def pick_defaults(provider_id: str, models: list[str]) -> tuple[str | None, str | None]:
    """(fast model for scoring, quality model for writing): the provider's recommended models
    when this key has them, otherwise the closest match by name."""
    provider = PROVIDERS[provider_id]
    return _pick(models, provider.fast_prefs, _FAST_HINTS), _pick(models, provider.quality_prefs, _QUALITY_HINTS)


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```\s*$", re.IGNORECASE | re.MULTILINE)
_OUTERMOST = re.compile(r"[\[{][\s\S]*[\]}]")


def parse_json(text: str) -> Any | None:
    """Parse JSON from a model reply, tolerating code fences and surrounding prose."""
    try:
        return json.loads(_FENCE.sub("", text).strip())
    except (json.JSONDecodeError, ValueError):
        pass
    match = _OUTERMOST.search(text)
    if match:
        try:
            return json.loads(match.group(0))
        except (json.JSONDecodeError, ValueError):
            return None
    return None
