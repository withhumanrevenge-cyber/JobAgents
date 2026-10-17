import json
from types import SimpleNamespace

import httpx
import pytest
import respx

from app.config import get_settings
from app.services import crypto, llm, llm_anthropic
from app.services.ai import decide_mode

from .conftest import SECOND_FERNET_KEY

# --- Which AI runs ----------------------------------------------------------------------------

@pytest.mark.parametrize("plan,row,mode", [
    ("free", None, "trial"),
    ("free", {"status": "valid"}, "byok"),
    ("free", {"status": "valid", "use_own_key": False}, "byok"),  # Free can't opt into hosted
    ("free", {"status": "invalid"}, "trial"),
    ("pro", None, "hosted"),
    ("pro", {"status": "valid", "use_own_key": True}, "byok"),
    ("pro", {"status": "valid", "use_own_key": False}, "hosted"),
    ("premium", {"status": "invalid", "use_own_key": True}, "hosted"),
])
def test_decide_mode(plan, row, mode):
    assert decide_mode(plan, row) == mode


# --- Key encryption ---------------------------------------------------------------------------

def test_encrypt_round_trip_and_never_plaintext():
    token = crypto.encrypt("gsk_supersecretkey1234")
    assert "supersecret" not in token
    assert crypto.decrypt(token) == "gsk_supersecretkey1234"
    assert crypto.hint("gsk_supersecretkey1234") == "…1234"


def test_rotation_keeps_old_ciphertexts_readable(monkeypatch):
    old_token = crypto.encrypt("sk-old-key-abcdef")
    current = get_settings().BYOK_ENCRYPTION_KEY
    monkeypatch.setattr(get_settings(), "BYOK_ENCRYPTION_KEY", f"{SECOND_FERNET_KEY},{current}")
    assert crypto.decrypt(old_token) == "sk-old-key-abcdef"
    monkeypatch.setattr(get_settings(), "BYOK_ENCRYPTION_KEY", SECOND_FERNET_KEY)
    assert crypto.decrypt(old_token) is None  # rotated out: treated as "add your key again"


# --- Model defaults ---------------------------------------------------------------------------

def test_pick_defaults_prefers_recommended_models():
    models = ["llama-3.1-8b-instant", "openai/gpt-oss-120b", "openai/gpt-oss-20b"]
    assert llm.pick_defaults("groq", models) == ("openai/gpt-oss-20b", "openai/gpt-oss-120b")


def test_pick_defaults_falls_back_to_name_hints():
    models = ["gemini-9-pro", "gemini-9-flash"]
    assert llm.pick_defaults("gemini", models) == ("gemini-9-flash", "gemini-9-pro")


def test_pick_defaults_for_claude():
    fast, quality = llm.pick_defaults("anthropic", ["claude-opus-5-5", "claude-haiku-5-5", "claude-sonnet-5-5"])
    assert (fast, quality) == ("claude-haiku-5-5", "claude-opus-5-5")


# --- OpenAI-compatible providers --------------------------------------------------------------

@respx.mock
async def test_groq_completion_parses_text_and_tokens():
    route = respx.post("https://api.groq.com/openai/v1/chat/completions").mock(return_value=httpx.Response(
        200, json={"choices": [{"message": {"content": "{\"score\": 81}"}}], "usage": {"total_tokens": 321}}))
    result = await llm.complete("groq", "gsk_test", "openai/gpt-oss-20b", "sys", "prompt", fast=True)
    assert (result.text, result.tokens) == ('{"score": 81}', 321)
    sent = json.loads(route.calls[0].request.content)
    assert sent["messages"][0] == {"role": "system", "content": "sys"}
    assert route.calls[0].request.headers["authorization"] == "Bearer gsk_test"


@respx.mock
async def test_openai_uses_max_completion_tokens():
    route = respx.post("https://api.openai.com/v1/chat/completions").mock(return_value=httpx.Response(
        200, json={"choices": [{"message": {"content": "ok"}}]}))
    await llm.complete("openai", "sk-test", "gpt-5", None, "hi")
    sent = json.loads(route.calls[0].request.content)
    assert "max_completion_tokens" in sent and "max_tokens" not in sent and "temperature" not in sent


@respx.mock
@pytest.mark.parametrize("status,body,error", [
    (401, {"error": {"message": "Invalid API Key"}}, llm.LLMAuthError),
    (429, {"error": {"message": "Rate limit reached"}}, llm.LLMRateLimitError),
    (404, {"error": {"message": "The model does not exist"}}, llm.LLMModelError),
    (500, {"error": {"message": "boom"}}, llm.LLMError),
])
async def test_error_mapping(status, body, error):
    respx.post("https://api.groq.com/openai/v1/chat/completions").mock(return_value=httpx.Response(status, json=body))
    with pytest.raises(error):
        await llm.complete("groq", "gsk_test", "m", None, "hi")


@respx.mock
async def test_gemini_bad_key_is_an_auth_error():
    respx.post("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions").mock(
        return_value=httpx.Response(400, json=[{"error": {"message": "API key not valid. Please pass a valid API key."}}]))
    with pytest.raises(llm.LLMAuthError):
        await llm.complete("gemini", "AIza-bad", "gemini-2.5-flash", None, "hi")


@respx.mock
async def test_list_models_filters_non_chat_models():
    respx.get("https://api.groq.com/openai/v1/models").mock(return_value=httpx.Response(200, json={"data": [
        {"id": "openai/gpt-oss-20b"}, {"id": "whisper-large-v3"}, {"id": "llama-guard-4-12b"}, {"id": "playai-tts"}]}))
    assert await llm.list_models("groq", "gsk_test") == ["openai/gpt-oss-20b"]


@respx.mock
async def test_openrouter_checks_the_key_before_listing():
    respx.get("https://openrouter.ai/api/v1/key").mock(return_value=httpx.Response(401, json={"error": {"message": "No auth"}}))
    with pytest.raises(llm.LLMAuthError):
        await llm.list_models("openrouter", "sk-or-bad")


# --- Claude ----------------------------------------------------------------------------------

class _FakeMessages:
    def __init__(self, response):
        self.response, self.calls = response, []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class _FakeClient:
    def __init__(self, response):
        self.messages = _FakeMessages(response)
        self.beta = SimpleNamespace(messages=_FakeMessages(response))

    async def close(self):
        pass


def _claude_response(stop_reason="end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text="Hello")],
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    )


async def test_claude_reads_text_blocks_and_uses_fallbacks_on_opus(monkeypatch):
    client = _FakeClient(_claude_response())
    monkeypatch.setattr(llm_anthropic, "_client", lambda key: client)
    result = await llm.complete("anthropic", "sk-ant-x", "claude-opus-5-5", "sys", "hi")
    assert (result.text, result.tokens) == ("Hello", 15)
    call = client.beta.messages.calls[0]
    assert call["fallbacks"] == "default" and call["betas"] == ["server-side-fallback-2026-07-01"]
    assert call["output_config"] == {"effort": "medium"} and call["system"] == "sys"


async def test_claude_haiku_skips_fallbacks_and_scores_at_low_effort(monkeypatch):
    client = _FakeClient(_claude_response())
    monkeypatch.setattr(llm_anthropic, "_client", lambda key: client)
    await llm.complete("anthropic", "sk-ant-x", "claude-haiku-5-5", None, "hi", fast=True)
    assert client.messages.calls[0]["output_config"] == {"effort": "low"}
    assert not client.beta.messages.calls


async def test_claude_refusal_is_an_error(monkeypatch):
    monkeypatch.setattr(llm_anthropic, "_client", lambda key: _FakeClient(_claude_response("refusal")))
    with pytest.raises(llm.LLMError):
        await llm.complete("anthropic", "sk-ant-x", "claude-haiku-5-5", None, "hi")
