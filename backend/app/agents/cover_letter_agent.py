# backend/app/agents/cover_letter_agent.py
import logging
from typing import Dict, Any, Optional
from app.services.groq_service import groq_service

logger = logging.getLogger(__name__)


async def generate_cover_letter(
    job: Dict[str, Any],
    parsed_resume: Optional[Dict[str, Any]],
    tailored_resume: Optional[Dict[str, Any]],
    user_id: Optional[str] = None
) -> str:
    candidate_name = tailored_resume.get("name") if tailored_resume else (parsed_resume.get("name") if parsed_resume else "Candidate")
    candidate_summary = tailored_resume.get("summary") if tailored_resume else (parsed_resume.get("summary") if parsed_resume else "")
    skills = (tailored_resume.get("skills") if tailored_resume else (parsed_resume.get("skills") if parsed_resume else []))[:8]
    skills_str = ", ".join(skills)
    
    recent_role = ""
    if parsed_resume and parsed_resume.get("experience"):
        exp = parsed_resume["experience"][0]
        recent_role = f"{exp.get('title', '')} at {exp.get('company', '')}"

    system_prompt = """You write short, confident cover letters for job applications. Strict rules:
- Exactly 3 paragraphs, 90-120 words total.
- Paragraph 1: one sentence stating the role + company, one sentence on why this candidate is a fit.
- Paragraph 2: one or two concrete achievements or skills tied to the job's requirements. No fabrication — only use facts from the candidate context.
- Paragraph 3: one sentence on enthusiasm + a clear ask to discuss further.
- No "Dear Hiring Manager" salutation, no "Sincerely" sign-off — those get added separately.
- No clichés: avoid "passionate", "dynamic", "synergy", "hit the ground running", "team player".
- No em-dashes. Use periods.
- Plain prose, no markdown, no bullet points.
Return the body text only."""

    user_prompt = f"""JOB
Title: {job.get('title', '')}
Company: {job.get('company', '')}
Description: {(job.get('description') or '')[:1500]}
Required skills/tags: {', '.join(job.get('tags', []))}

CANDIDATE
Name: {candidate_name}
Recent role: {recent_role}
Top skills: {skills_str}
Summary: {candidate_summary}

Write the cover letter body."""

    text = await groq_service.call(
        user_prompt,
        system_prompt,
        meterUserId=user_id
    )
    return text.strip()