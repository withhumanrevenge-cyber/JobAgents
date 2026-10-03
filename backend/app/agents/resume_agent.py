# backend/app/agents/resume_agent.py
import logging
from typing import Dict, Any, Optional, List
from app.services.groq_service import groq_service
from app.services.supabase_service import supabase_service
from app.core.config import settings

logger = logging.getLogger(__name__)


def compute_ats_score(resume: Dict[str, Any], job_description: str, job_tags: List[str]) -> int:
    resume_text = " ".join([
        resume.get("summary", ""),
        " ".join(resume.get("skills", [])),
        " ".join(f"{e.get('title', '')} {' '.join(e.get('bullets', []))}" for e in resume.get("experience", [])),
        " ".join(f"{p.get('name', '')} {p.get('description', '')} {' '.join(p.get('tech', []))}" for p in resume.get("projects", [])),
    ]).lower()

    keywords = list(set(job_tags + [
        w for w in job_description.lower().split()
        if len(w) > 4 and w.isalnum()
    ]))

    if not keywords:
        return 0

    matched = sum(1 for kw in keywords if kw in resume_text)
    return min(99, int(round((matched / len(keywords)) * 100)))


async def generate_tailored_resume(user_id: str, job_id: str) -> Dict[str, Any]:
    # Get job
    job = await supabase_service.get_job_by_id(job_id)
    if not job:
        raise ValueError(f"Job not found: {job_id}")

    # Get profile
    profile = await supabase_service.get_profile(user_id)
    if not profile:
        raise ValueError(f"Profile not found for user: {user_id}")

    parsed_resume = profile.get("parsed_resume")

    # Get user email from auth
    supabase = supabase_service.client
    auth_user = supabase.auth.admin.get_user_by_id(user_id)
    auth_email = auth_user.user.email if auth_user.user else ""

    # Build base resume data
    if parsed_resume:
        base_resume = {
            "name": parsed_resume.get("name") or profile.get("full_name") or "Candidate",
            "email": parsed_resume.get("email") or profile.get("email") or auth_email or "candidate@example.com",
            "phone": parsed_resume.get("phone") or profile.get("phone") or "",
            "summary": parsed_resume.get("summary", ""),
            "skills": parsed_resume.get("skills", []),
            "experience": parsed_resume.get("experience", []),
            "education": parsed_resume.get("education", []),
            "projects": parsed_resume.get("projects", []),
        }
    else:
        base_resume = {
            "name": profile.get("full_name") or "Engineering Candidate",
            "email": profile.get("email") or auth_email or "candidate@example.com",
            "phone": profile.get("phone") or "",
            "summary": "High-performing software engineer skilled in building modern, scalable web applications.",
            "skills": ["React", "TypeScript", "Next.js", "JavaScript", "Node.js"],
            "experience": [{
                "company": "Previous Company",
                "title": "Software Engineer",
                "dates": "2022 - Present",
                "bullets": [
                    "Built responsive web applications using modern JavaScript frameworks.",
                    "Collaborated in agile teams to deliver high-quality software on schedule.",
                    "Improved system performance through code optimization and best practices.",
                ],
            }],
            "education": [{"school": "University", "degree": "B.Sc. Computer Science", "year": "2022"}],
            "projects": [],
        }

    system_prompt = """You are a professional ATS-optimized resume writer specializing in tech roles.
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

    user_prompt = f"""JOB:
Company: {job.get('company', '')}
Title: {job.get('title', '')}
Key Skills Required: {', '.join(job.get('tags', []))}
Description:
{(job.get('description') or 'No description provided.')[:2500]}

BASE RESUME TO TAILOR:
{base_resume}"""

    response = await groq_service.call(
        user_prompt,
        system_prompt,
        meterUserId=user_id
    )

    parsed = groq_service.parse_json(response)
    if parsed and parsed.get("name") and parsed.get("skills"):
        tailored = parsed
    else:
        logger.error(f"Failed to parse tailored resume from Groq: {response[:200]}")
        tailored = base_resume

    tailored["ats_score"] = compute_ats_score(tailored, job.get("description", ""), job.get("tags", []))

    # Save to matches table
    await supabase_service.update_match(user_id, job_id, {"tailored_resume_json": tailored})

    return tailored