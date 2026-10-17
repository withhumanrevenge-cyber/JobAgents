import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.agents import proof as P
from app.agents.writing import GenerationError
from app.main import app
from app.routers.hire import candidate_view

T0 = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)
QUESTIONS = [{"skill": s, "question": f"How would you handle {s}?"} for s in ("SQL", "Dashboards", "Stakeholders")]


class FakeAI:
    """Replays scripted model replies in order and records the prompts it was sent."""

    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.prompts: list[str] = []

    async def call(self, prompt: str, system: str | None = None, *, fast: bool = False) -> str:
        self.prompts.append(prompt)
        return self.replies.pop(0)


def test_full_proof_walks_main_followup_pairs_then_finishes():
    steps = P.new_steps(QUESTIONS, T0)
    assert P.current_index(steps) == 0 and steps[0]["asked_at"] and steps[1]["asked_at"] is None
    assert P.total_steps(steps) == 6

    now = T0
    for n in range(3):
        now += timedelta(minutes=2)
        index = P.current_index(steps)
        P.record_answer(steps, index, f"answer {n}", False, now)
        P.insert_follow_up(steps, index, f"follow-up {n}?", now)
        assert P.start_next(steps, now)
        assert steps[P.current_index(steps)]["kind"] == "followup"
        now += timedelta(minutes=1)
        P.record_answer(steps, P.current_index(steps), f"detail {n}", False, now)
        more = P.start_next(steps, now)
        assert more == (n < 2)

    assert [s["kind"] for s in steps] == ["main", "followup"] * 3
    assert all(s["seconds"] in (60, 120) and not s["late"] for s in steps)


def test_a_missing_follow_up_shrinks_the_total():
    steps = P.new_steps(QUESTIONS, T0)
    P.record_answer(steps, 0, "answer", False, T0 + timedelta(seconds=30))
    P.start_next(steps, T0)  # follow-up couldn't be written: straight to question 2
    assert P.current_index(steps) == 1 and steps[1]["kind"] == "main"
    assert P.total_steps(steps) == 5


def test_late_and_pasted_answers_are_flagged_from_server_time():
    steps = P.new_steps(QUESTIONS, T0)
    P.record_answer(steps, 0, "x" * 9000, True, T0 + timedelta(seconds=P.TIME_LIMIT_S["main"] + P.GRACE_S + 1))
    assert steps[0]["late"] and steps[0]["pasted"]
    assert len(steps[0]["answer"]) == P.MAX_ANSWER_CHARS
    assert P.integrity(steps) == {"answered": 1, "pasted": 1, "late": 1}


async def test_questions_need_three_usable_items():
    ai = FakeAI(json.dumps({"questions": QUESTIONS[:2]}))
    with pytest.raises(GenerationError):
        await P.generate_questions(ai, "Data Analyst", ["SQL"], "desc", "entry")  # type: ignore[arg-type]

    ai = FakeAI(json.dumps({"questions": QUESTIONS + [{"skill": "Extra", "question": "Fourth?"}]}))
    got = await P.generate_questions(ai, "Data Analyst", ["SQL"], "desc", "entry")  # type: ignore[arg-type]
    assert [q["skill"] for q in got] == ["SQL", "Dashboards", "Stakeholders"]


async def test_unusable_follow_up_is_skipped_not_fatal():
    step = {"skill": "SQL", "question": "Q?", "answer": "A"}
    assert await P.follow_up(FakeAI("ok"), "Data Analyst", step) is None  # type: ignore[arg-type]
    assert await P.follow_up(FakeAI('"Which index would you add, and why?"'), "Data Analyst", step) \
        == "Which index would you add, and why?"  # type: ignore[arg-type]


async def test_grade_keeps_only_quotes_that_are_really_in_the_answers():
    steps = P.new_steps(QUESTIONS[:1], T0)
    P.record_answer(steps, 0, "I would add a composite index on (user_id, created_at) and check the plan.", True, T0)
    reply = json.dumps({
        "overall": 140,
        "summary": "Solid indexing instinct.",
        "skills": [{"skill": "SQL", "score": 82,
                    "evidence": ["add a composite index on (user_id, created_at)", "I am a SQL expert with 10 years"],
                    "note": "Knows indexes."}],
        "strengths": ["Indexing"], "gaps": ["Didn't mention query plans in depth"],
    })
    report = await P.grade(FakeAI(reply), "Data Analyst", steps)  # type: ignore[arg-type]
    assert report["overall"] == 100
    assert report["skills"][0]["evidence"] == ["add a composite index on (user_id, created_at)"]
    # Integrity comes from the server's measurements, not the model.
    assert report["integrity"] == {"answered": 1, "pasted": 1, "late": 0}


async def test_grade_rejects_a_reply_without_skills():
    with pytest.raises(GenerationError):
        await P.grade(FakeAI('{"overall": 70}'), "Data Analyst", P.new_steps(QUESTIONS, T0))  # type: ignore[arg-type]


def test_decline_feedback_names_the_weakest_skill_and_a_gap():
    report = {"skills": [{"skill": "SQL", "score": 80}, {"skill": "Dashboards", "score": 41}],
              "gaps": ["Explain chart choices"]}
    text = P.decline_feedback(report)
    assert "Dashboards (41/100)" in text and "Explain chart choices" in text
    assert P.decline_feedback(None) == "The team decided not to move forward this time."


PROFILE = {"full_name": "Asha Rao", "email": "asha@example.com", "linkedin_url": "https://linkedin.com/in/asha",
           "parsed_resume": {"name": "Asha Rao", "email": "asha@example.com", "phone": "+91 99999 99999",
                             "skills": ["SQL"]}}


def test_recruiters_see_no_contact_details_until_the_candidate_accepts():
    hidden = candidate_view({"id": "m1", "candidate_response": None}, PROFILE, None)["candidate"]
    assert hidden["email"] is None and hidden["linkedin_url"] is None
    assert "email" not in hidden["parsed_resume"] and "phone" not in hidden["parsed_resume"]
    assert hidden["parsed_resume"]["skills"] == ["SQL"] and hidden["full_name"] == "Asha Rao"

    declined = candidate_view({"id": "m1", "candidate_response": "declined"}, PROFILE, None)["candidate"]
    assert declined["email"] is None

    shown = candidate_view({"id": "m1", "candidate_response": "accepted"}, PROFILE, None)["candidate"]
    assert shown["email"] == "asha@example.com" and shown["parsed_resume"]["phone"] == "+91 99999 99999"


def test_proof_routes_require_auth_and_valid_ids():
    client = TestClient(app)
    for method, path in [("get", "/api/proofs"), ("post", "/api/proofs"),
                         ("post", "/api/proofs/00000000-0000-0000-0000-000000000000/answer"),
                         ("post", "/api/hire/candidates/00000000-0000-0000-0000-000000000000/invite"),
                         ("post", "/api/hire/candidates/00000000-0000-0000-0000-000000000000/decision")]:
        res = client.request(method.upper(), path, json={} if method == "post" else None)
        assert res.status_code == 401, path
    # Malformed slugs never reach the database.
    assert client.get("/api/public/proofs/x").status_code == 404
