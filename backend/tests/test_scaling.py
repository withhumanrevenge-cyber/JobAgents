import asyncio

import httpx
import pytest
import respx

from app.agents import matching
from app.agents.matching import rank_by_relevance, relevance_scorer
from app.config import get_settings
from app.errors import ApiError
from app.services import ai
from app.services.ai import AIContext

PROFILE = {"target_roles": ["Data Analyst"]}
RESUME = {"skills": ["SQL", "Python", "Power BI", "C++"]}


def job(id_: str, title: str, description: str = "", tags: list[str] | None = None) -> dict:
    return {"id": id_, "title": title, "description": description, "tags": tags or []}


def test_relevance_puts_role_and_skill_overlap_first_and_drops_unrelated():
    jobs = [
        job("chef", "Head Chef", "Run the kitchen."),
        job("skills", "Reporting Associate", "Daily SQL and Power BI dashboards."),
        job("role", "Senior Data Analyst", "SQL, Python, stakeholder reporting."),
    ]
    ranked = rank_by_relevance(jobs, relevance_scorer(PROFILE, RESUME))
    assert [j["id"] for j in ranked] == ["role", "skills"]


def test_relevance_matches_whole_words_only():
    scorer = relevance_scorer({"target_roles": []}, {"skills": ["Go", "C++"]})
    assert scorer is not None
    assert scorer(job("a", "Google Ads Manager", "Grow our google presence.")) == 0
    assert scorer(job("b", "Backend Engineer", "Services in Go and C++.")) == 2


def test_generic_title_words_alone_do_not_count():
    scorer = relevance_scorer({"target_roles": ["Senior Software Engineer"]}, None)
    assert scorer is not None
    assert scorer(job("a", "Senior Mechanical Engineer")) == 0
    assert scorer(job("b", "Software Developer")) > 0


def test_nothing_to_match_on_keeps_the_pool_untouched():
    jobs = [job("a", "Anything"), job("b", "Else")]
    assert relevance_scorer({}, None) is None
    assert rank_by_relevance(jobs, None) == jobs


def test_no_overlap_at_all_keeps_everything_so_the_user_still_gets_scores():
    jobs = [job("a", "Head Chef"), job("b", "Pilot")]
    assert rank_by_relevance(jobs, relevance_scorer(PROFILE, RESUME)) == jobs


def hosted_ctx() -> AIContext:
    return AIContext("user-1", "pro", "hosted", "groq", "hosted-test-key", "fast-model", "quality-model")


@pytest.fixture
def no_metering(monkeypatch):
    metered = []

    async def fake_meter(ctx, result):
        metered.append(f"{result.provider or ctx.provider}:{result.model}")

    monkeypatch.setattr(ai, "_meter", fake_meter)
    return metered


@pytest.fixture
def fallback(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "HOSTED_FALLBACK_PROVIDER", "gemini")
    monkeypatch.setattr(s, "HOSTED_FALLBACK_API_KEY", "gemini-key")
    monkeypatch.setattr(s, "HOSTED_FALLBACK_FAST_MODEL", "gemini-2.5-flash-lite")
    monkeypatch.setattr(s, "HOSTED_FALLBACK_MODEL", "gemini-2.5-flash")


def chat_reply(text: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}], "usage": {"total_tokens": 7}})


@respx.mock
async def test_hosted_call_falls_back_when_groq_is_rate_limited(no_metering, fallback):
    respx.post("https://api.groq.com/openai/v1/chat/completions").mock(
        return_value=httpx.Response(429, json={"error": {"message": "Rate limit reached"}}))
    gemini = respx.post("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions").mock(
        return_value=chat_reply("from gemini"))

    assert await hosted_ctx().call("hi", fast=True) == "from gemini"
    assert gemini.calls.last.request.headers["authorization"] == "Bearer gemini-key"
    assert no_metering == ["gemini:gemini-2.5-flash-lite"]


@respx.mock
async def test_hosted_call_without_a_fallback_reports_unavailable(no_metering):
    respx.post("https://api.groq.com/openai/v1/chat/completions").mock(
        return_value=httpx.Response(429, json={"error": {"message": "Rate limit reached"}}))
    with pytest.raises(ApiError) as e:
        await hosted_ctx().call("hi", fast=True)
    assert e.value.status == 503


@respx.mock
async def test_byok_calls_never_use_our_fallback(no_metering, fallback):
    respx.post("https://api.groq.com/openai/v1/chat/completions").mock(
        return_value=httpx.Response(429, json={"error": {"message": "Rate limit reached"}}))
    gemini = respx.post("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions").mock(
        return_value=chat_reply("should not happen"))
    ctx = AIContext("user-1", "free", "byok", "groq", "users-own-key", "fast-model", "quality-model")
    with pytest.raises(ApiError) as e:
        await ctx.call("hi", fast=True)
    assert e.value.extra.get("code") == "ai_key_quota"
    assert not gemini.called


async def test_one_match_run_per_user_at_a_time(monkeypatch):
    running, peak = 0, 0

    async def fake_run(user_id, *, limit, run_started_at):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1
        return {"user": user_id}

    monkeypatch.setattr(matching, "_match_jobs_for_user", fake_run)
    await asyncio.gather(*(matching.match_jobs_for_user("same-user") for _ in range(3)))
    assert peak == 1

    peak = 0
    await asyncio.gather(matching.match_jobs_for_user("a"), matching.match_jobs_for_user("b"))
    assert peak == 2


def days_ago(n: float) -> str:
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


def test_newer_postings_go_first_among_equally_relevant_jobs():
    jobs = [
        {**job("old", "Data Analyst", "SQL"), "posted_date": days_ago(20)},
        {**job("week", "Data Analyst", "SQL"), "posted_date": days_ago(5)},
        {**job("new", "Data Analyst", "SQL"), "posted_date": days_ago(1)},
    ]
    ranked = rank_by_relevance(jobs, relevance_scorer(PROFILE, RESUME))
    assert [j["id"] for j in ranked] == ["new", "week", "old"]


def test_freshness_never_lifts_an_unrelated_job():
    jobs = [
        {**job("relevant-old", "Senior Data Analyst", "SQL, Python"), "posted_date": days_ago(25)},
        {**job("unrelated-new", "Head Chef", "Run the kitchen."), "posted_date": days_ago(0)},
    ]
    assert [j["id"] for j in rank_by_relevance(jobs, relevance_scorer(PROFILE, RESUME))] == ["relevant-old"]


def test_jobs_older_than_the_window_are_not_stored():
    from app.agents.job_fetcher import _is_recent
    from app.plans import JOB_MAX_AGE_DAYS
    assert _is_recent({"posted_date": days_ago(JOB_MAX_AGE_DAYS - 1)})
    assert not _is_recent({"posted_date": days_ago(JOB_MAX_AGE_DAYS + 1)})
    assert _is_recent({"posted_date": "2026-10-18T10:00:00"})  # naive timestamps count as UTC


@respx.mock
async def test_adzuna_is_asked_for_the_newest_jobs(monkeypatch):
    from app.agents.job_fetcher import fetch_adzuna_jobs
    from app.plans import JOB_MAX_AGE_DAYS
    s = get_settings()
    monkeypatch.setattr(s, "ADZUNA_APP_ID", "id")
    monkeypatch.setattr(s, "ADZUNA_APP_KEY", "key")
    route = respx.get(url__regex=r"https://api\.adzuna\.com/v1/api/jobs/in/search/\d+").mock(
        return_value=httpx.Response(200, json={"results": []}))
    await fetch_adzuna_jobs("data analyst", "IN", pages=1)
    params = route.calls.last.request.url.params
    assert params["sort_by"] == "date" and params["max_days_old"] == str(JOB_MAX_AGE_DAYS)
