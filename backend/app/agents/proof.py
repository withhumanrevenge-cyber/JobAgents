"""Proof of Fit: a short, timed work sample for one role, graded per skill with evidence.

A proof is three main questions, each followed by one follow-up written from the candidate's own
answer, so a pasted generic answer runs into a question it can't anticipate. Grading quotes the
answers; quotes that aren't actually in the answers are dropped, so a report can't put words in
the candidate's mouth.

Step handling here is pure (no database), so the router stays thin and this stays testable."""

import re
from datetime import datetime
from typing import Any, Literal

from app.agents.writing import GenerationError
from app.services.ai import AIContext
from app.services.llm import parse_json

MAIN_QUESTIONS = 3
TIME_LIMIT_S = {"main": 300, "followup": 180}
# Answers are accepted after the limit (connections drop), but flagged late past this grace.
GRACE_S = 30
MAX_ANSWER_CHARS = 4000
# An unfinished proof can't be resumed after this; start a new one.
EXPIRES_AFTER_S = 24 * 3600

StepKind = Literal["main", "followup"]

QUESTIONS_SYSTEM = """You design short work-sample assessments for hiring. Given a role, write exactly 3 questions that test the 3 skills that matter most for doing this job well.
Rules:
- Each question is a concrete scenario from this kind of job: the candidate must explain what they would do, how, and why. Answerable in 3-5 minutes of writing.
- No trivia, no definitions ("what is X?"), no yes/no questions, no questions about the candidate's past that can't be checked.
- Match the seniority: a fresher gets a realistic first-year problem, a senior gets a judgment call.
- Plain language, under 60 words per question.
Return ONLY valid JSON, no markdown:
{"questions": [{"skill": "<skill tested>", "question": "<the question>"}, ...]}"""

FOLLOWUP_SYSTEM = """You are an interviewer probing whether a candidate really understands what they just wrote.
Write ONE follow-up question to their answer that:
- picks the most important claim, step or decision in their answer and asks for the specific detail behind it, OR changes one condition of the scenario and asks what they would do differently;
- cannot be answered with a generic textbook paragraph;
- if the answer was empty or off-topic, asks them to make one concrete first step instead.
Under 40 words. Return only the question text, nothing else."""

GRADE_SYSTEM = """You grade a work-sample assessment for a hiring decision. Be fair, specific and strict.
Rules:
- Score each skill 0-100 ONLY from what the answers show. Claims without specifics, or generic textbook answers, score at most 50. Clear, correct, specific reasoning scores 75+.
- Follow-up answers matter: a strong main answer with a weak follow-up suggests shallow understanding.
- Evidence: for each skill quote 1-2 short phrases (max 25 words each) copied EXACTLY from the candidate's answers. Never paraphrase inside a quote.
- Answers marked pasted or late are not wrong by themselves; judge the content, and mention it in the summary only if the content also looks generic.
- overall is your judgment of fit for the role, not an average.
Return ONLY valid JSON, no markdown:
{
  "overall": <0-100>,
  "summary": "<2 sentences a recruiter can act on>",
  "skills": [{"skill": "<skill>", "score": <0-100>, "evidence": ["<exact quote>", ...], "note": "<one sentence>"}],
  "strengths": ["<short point>", ...],
  "gaps": ["<short point the candidate could improve>", ...]
}"""


def _clamp(value: Any) -> int:
    return max(0, min(100, round(value))) if isinstance(value, (int, float)) else 0


async def generate_questions(ai: AIContext, role_title: str, skills: list[str], description: str,
                             seniority: str | None) -> list[dict[str, str]]:
    prompt = (
        f"ROLE: {role_title}\nSeniority: {seniority or 'not stated'}\n"
        f"Skills the employer lists: {', '.join(skills) or 'not listed, infer from the description'}\n"
        f"Description:\n{(description or 'No description.')[:2500]}"
    )
    parsed = parse_json(await ai.call(prompt, QUESTIONS_SYSTEM))
    raw = parsed.get("questions") if isinstance(parsed, dict) else parsed
    questions = [
        {"skill": str(q.get("skill") or "General").strip()[:80], "question": str(q["question"]).strip()}
        for q in (raw if isinstance(raw, list) else [])
        if isinstance(q, dict) and str(q.get("question") or "").strip()
    ][:MAIN_QUESTIONS]
    if len(questions) < MAIN_QUESTIONS:
        raise GenerationError("Couldn't prepare your questions. Please try again.")
    return questions


async def follow_up(ai: AIContext, role_title: str, step: dict[str, Any]) -> str | None:
    """The follow-up question, or None if the model's reply is unusable (the proof then moves
    on without one rather than failing)."""
    prompt = (f"ROLE: {role_title}\nSKILL: {step['skill']}\nQUESTION: {step['question']}\n"
              f"CANDIDATE'S ANSWER:\n{(step.get('answer') or '(no answer)')[:MAX_ANSWER_CHARS]}")
    text = (await ai.call(prompt, FOLLOWUP_SYSTEM, fast=True)).strip().strip('"').strip()
    return text if 10 <= len(text) <= 400 else None


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip(" \"'“”‘’.,;:!?")


def _verified_quotes(quotes: Any, answers: str) -> list[str]:
    if not isinstance(quotes, list):
        return []
    kept = []
    for q in quotes:
        q = str(q).strip()
        if q and len(q.split()) <= 30 and _norm(q) in answers:
            kept.append(q)
    return kept[:2]


def integrity(steps: list[dict[str, Any]]) -> dict[str, int]:
    """Facts the server measured, never the model's guess."""
    answered = [s for s in steps if s.get("answer") is not None]
    return {
        "answered": len(answered),
        "pasted": sum(1 for s in answered if s.get("pasted")),
        "late": sum(1 for s in answered if s.get("late")),
    }


async def grade(ai: AIContext, role_title: str, steps: list[dict[str, Any]]) -> dict[str, Any]:
    transcript = "\n\n".join(
        f"[{s['kind'].upper()} · {s['skill']} · {s.get('seconds', '?')}s"
        f"{' · pasted' if s.get('pasted') else ''}{' · late' if s.get('late') else ''}]\n"
        f"Q: {s['question']}\nA: {(s.get('answer') or '(no answer)')[:MAX_ANSWER_CHARS]}"
        for s in steps
    )
    parsed = parse_json(await ai.call(f"ROLE: {role_title}\n\n{transcript}", GRADE_SYSTEM))
    if not isinstance(parsed, dict) or not isinstance(parsed.get("skills"), list):
        raise GenerationError("Grading failed. Your answers are saved; please try again.")

    answers = _norm(" ".join(s.get("answer") or "" for s in steps))
    as_list = lambda v: [str(x).strip() for x in v if str(x).strip()][:4] if isinstance(v, list) else []  # noqa: E731
    skills = [
        {
            "skill": str(item.get("skill") or "General")[:80],
            "score": _clamp(item.get("score")),
            "evidence": _verified_quotes(item.get("evidence"), answers),
            "note": str(item.get("note") or "")[:300],
        }
        for item in parsed["skills"] if isinstance(item, dict)
    ]
    if not skills:
        raise GenerationError("Grading failed. Your answers are saved; please try again.")
    return {
        "overall": _clamp(parsed.get("overall")),
        "summary": str(parsed.get("summary") or "")[:600],
        "skills": skills,
        "strengths": as_list(parsed.get("strengths")),
        "gaps": as_list(parsed.get("gaps")),
        "integrity": integrity(steps),
    }


def decline_feedback(report: dict[str, Any] | None) -> str:
    """What a declined candidate is told when the recruiter didn't write anything."""
    gaps = (report or {}).get("gaps") or []
    weakest = min((report or {}).get("skills") or [], key=lambda s: s.get("score", 0), default=None)
    parts = ["The team decided not to move forward this time."]
    if weakest:
        parts.append(f"Your lowest-scoring area was {weakest['skill']} ({weakest['score']}/100).")
    if gaps:
        parts.append(f"Worth working on: {gaps[0]}")
    return " ".join(parts)


# Step handling. steps holds every question in order; main questions are created up front with
# asked_at unset, and each follow-up is inserted right after its main question once answered.

def new_steps(questions: list[dict[str, str]], now: datetime) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = [
        {"kind": "main", "skill": q["skill"], "question": q["question"], "asked_at": None, "answer": None}
        for q in questions
    ]
    steps[0]["asked_at"] = now.isoformat()
    return steps


def current_index(steps: list[dict[str, Any]]) -> int | None:
    return next((i for i, s in enumerate(steps) if s.get("answer") is None), None)


def record_answer(steps: list[dict[str, Any]], index: int, answer: str, pasted: bool, now: datetime) -> None:
    step = steps[index]
    asked = datetime.fromisoformat(step["asked_at"]) if step.get("asked_at") else now
    seconds = max(0, round((now - asked).total_seconds()))
    step.update({
        "answer": answer.strip()[:MAX_ANSWER_CHARS],
        "answered_at": now.isoformat(),
        "seconds": seconds,
        "pasted": bool(pasted),
        "late": seconds > TIME_LIMIT_S[step["kind"]] + GRACE_S,
    })


def insert_follow_up(steps: list[dict[str, Any]], after: int, question: str, now: datetime) -> None:
    steps.insert(after + 1, {"kind": "followup", "skill": steps[after]["skill"], "question": question,
                             "asked_at": now.isoformat(), "answer": None})


def start_next(steps: list[dict[str, Any]], now: datetime) -> bool:
    """Start the clock on the next unanswered question. False when every question is answered."""
    index = current_index(steps)
    if index is None:
        return False
    if not steps[index].get("asked_at"):
        steps[index]["asked_at"] = now.isoformat()
    return True


def total_steps(steps: list[dict[str, Any]]) -> int:
    """For "question n of N": every main question gets a follow-up unless one couldn't be written."""
    mains = sum(1 for s in steps if s["kind"] == "main")
    answered_mains_without_followup = sum(
        1 for i, s in enumerate(steps)
        if s["kind"] == "main" and s.get("answer") is not None
        and not (i + 1 < len(steps) and steps[i + 1]["kind"] == "followup")
    )
    return mains * 2 - answered_mains_without_followup
