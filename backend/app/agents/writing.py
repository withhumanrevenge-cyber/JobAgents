"""Generation agents: tailored resume, cover letter, interview questions.

Each raises on an unusable model reply instead of returning a stand-in, so the caller's
`ai_action()` block refunds any credits."""

import json
import re
from typing import Any

from app.errors import ApiError
from app.services.ai import AIContext
from app.services.llm import parse_json


class GenerationError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__(502, message)


RESUME_SYSTEM = """You are a professional ATS-optimized resume writer specializing in tech roles.
Your task: take a job description and base resume, then rewrite the resume to maximize ATS score and relevance.
Rules:
- Keep all personal info (name, email, phone) EXACTLY as provided
- Rewrite summary to directly mirror the job's language and requirements
- Reorder/add skills to put the most relevant ones first
- Rephrase experience bullets to incorporate job keywords while staying truthful
- Tailor project descriptions to highlight relevant tech and impact
- Do NOT fabricate experience, companies, or degrees

Return ONLY a valid JSON object matching this exact shape:
{
  "name": "<string>",
  "email": "<string>",
  "phone": "<string>",
  "summary": "<tailored 2-3 sentence summary>",
  "skills": ["<skill>", ...],
  "experience": [{ "company": "<>", "title": "<>", "dates": "<>", "bullets": ["<>", ...] }],
  "education": [{ "school": "<>", "degree": "<>", "year": "<>" }],
  "projects": [{ "name": "<>", "description": "<>", "tech": ["<>"], "url": "<optional>" }]
}
No markdown. No text outside the JSON."""


def ats_score(resume: dict[str, Any], description: str, tags: list[str]) -> int:
    text = " ".join([
        resume.get("summary") or "",
        " ".join(resume.get("skills") or []),
        " ".join(f"{e.get('title', '')} {' '.join(e.get('bullets') or [])}" for e in resume.get("experience") or []),
        " ".join(f"{p.get('name', '')} {p.get('description', '')} {' '.join(p.get('tech') or [])}" for p in resume.get("projects") or []),
    ]).lower()
    keywords = {t.lower() for t in tags if t} | {w for w in re.split(r"\W+", description.lower()) if len(w) > 4}
    if not keywords:
        return 0
    hits = sum(1 for k in keywords if k in text)
    return min(99, round(hits / len(keywords) * 100))


async def tailor_resume(ai: AIContext, job: dict[str, Any], profile: dict[str, Any], resume: dict[str, Any], auth_email: str | None) -> dict[str, Any]:
    base = {
        "name": resume.get("name") or profile.get("full_name") or "",
        "email": resume.get("email") or profile.get("email") or auth_email or "",
        "phone": resume.get("phone") or profile.get("phone") or "",
        "summary": resume.get("summary") or "",
        "skills": resume.get("skills") or [],
        "experience": resume.get("experience") or [],
        "education": resume.get("education") or [],
        "projects": resume.get("projects") or [],
    }
    prompt = (
        f"JOB:\nCompany: {job['company']}\nTitle: {job['title']}\nKey Skills Required: {', '.join(job.get('tags') or [])}\n"
        f"Description:\n{(job.get('description') or 'No description provided.')[:2500]}\n\n"
        f"BASE RESUME TO TAILOR:\n{json.dumps(base, indent=2)}"
    )
    parsed = parse_json(await ai.call(prompt, RESUME_SYSTEM))
    if not isinstance(parsed, dict) or not parsed.get("name") or not isinstance(parsed.get("skills"), list):
        raise GenerationError("The AI returned an unusable resume. Your credits were refunded; please try again.")
    for key in ("experience", "education", "projects"):
        if not isinstance(parsed.get(key), list):
            parsed[key] = base[key]
    parsed["ats_score"] = ats_score(parsed, job.get("description") or "", job.get("tags") or [])
    return parsed


COVER_SYSTEM = """You write short, confident cover letters for job applications. Strict rules:
- Exactly 3 paragraphs, 90-120 words total.
- Paragraph 1: one sentence stating the role + company, one sentence on why this candidate is a fit.
- Paragraph 2: one or two concrete achievements or skills tied to the job's requirements. No fabrication, only use facts from the candidate context.
- Paragraph 3: one sentence on enthusiasm + a clear ask to discuss further.
- No "Dear Hiring Manager" salutation, no "Sincerely" sign-off, those get added separately.
- No clichés: avoid "passionate", "dynamic", "synergy", "hit the ground running", "team player".
- No em-dashes. Use periods.
- Plain prose, no markdown, no bullet points.
Return the body text only."""


async def cover_letter(ai: AIContext, job: dict[str, Any], resume: dict[str, Any], tailored: dict[str, Any] | None) -> str:
    src = tailored or resume
    recent = (resume.get("experience") or [{}])[0]
    prompt = (
        f"JOB\nTitle: {job['title']}\nCompany: {job['company']}\n"
        f"Description: {(job.get('description') or '')[:1500]}\nRequired skills/tags: {', '.join(job.get('tags') or [])}\n\n"
        f"CANDIDATE\nName: {src.get('name') or 'Candidate'}\n"
        f"Recent role: {(recent.get('title', '') + ' at ' + recent.get('company', '')) if recent else ''}\n"
        f"Top skills: {', '.join((src.get('skills') or [])[:8])}\nSummary: {src.get('summary') or ''}\n\n"
        "Write the cover letter body."
    )
    text = (await ai.call(prompt, COVER_SYSTEM)).strip()
    if len(text) < 40:
        raise GenerationError("The AI returned an empty cover letter. Your credits were refunded; please try again.")
    return text


INTERVIEW_SYSTEM = """You are an expert interview coach at a top tech company. Generate realistic, specific interview questions tailored to the job description and candidate background.
Return ONLY a JSON array of exactly 10 questions:
[
  {
    "question": "<specific interview question>",
    "category": "<technical|behavioral|role-specific|situational>",
    "tip": "<short coaching tip: what key points to cover in the answer>"
  }
]
Include a mix: 3 technical, 3 behavioral, 2 role-specific, 2 situational.
Make questions specific to the company, role, and candidate's background. No generic filler questions.
Return only valid JSON, no markdown, no extra text."""

_CATEGORIES = {"technical", "behavioral", "role-specific", "situational"}


async def interview_questions(ai: AIContext, job: dict[str, Any], resume: dict[str, Any] | None) -> list[dict[str, str]]:
    if resume:
        exp = (resume.get("experience") or [{}])[0]
        edu = (resume.get("education") or [{}])[0]
        context = (
            f"Target Role: {resume.get('target_role')}\nYears of Experience: {resume.get('years_experience')}\n"
            f"Key Skills: {', '.join((resume.get('skills') or [])[:15])}\n"
            f"Current/Last Role: {exp.get('title') or 'N/A'} at {exp.get('company') or 'N/A'}\n"
            f"Education: {edu.get('degree') or 'N/A'} from {edu.get('school') or 'N/A'}"
        )
    else:
        context = "No resume provided, generate general questions for the role."
    prompt = (
        f"JOB DETAILS:\nTitle: {job['title']}\nCompany: {job['company']}\nDescription:\n"
        f"{(job.get('description') or 'No description provided')[:2500]}\n\nCANDIDATE PROFILE:\n{context}\n\n"
        "Generate 10 targeted interview questions for this specific role and candidate."
    )
    parsed = parse_json(await ai.call(prompt, INTERVIEW_SYSTEM))
    questions = [
        {
            "question": str(q["question"]),
            "category": q.get("category") if q.get("category") in _CATEGORIES else "role-specific",
            "tip": str(q.get("tip") or ""),
        }
        for q in (parsed if isinstance(parsed, list) else [])
        if isinstance(q, dict) and q.get("question")
    ]
    if not questions:
        raise GenerationError("The AI returned no usable questions. Your credits were refunded; please try again.")
    return questions
