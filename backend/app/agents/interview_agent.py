# backend/app/agents/interview_agent.py
import logging
from typing import Dict, Any, List, Optional
from app.services.groq_service import groq_service
from app.core.config import settings

logger = logging.getLogger(__name__)


async def generate_interview_questions(
    job_title: str,
    job_company: str,
    job_description: str,
    parsed_resume: Optional[Dict[str, Any]],
    user_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    system_prompt = """You are an expert interview coach at a top tech company. Generate realistic, specific interview questions tailored to the job description and candidate background.
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
Return only valid JSON — no markdown, no extra text."""

    if parsed_resume:
        candidate_context = f"""Target Role: {parsed_resume.get('target_role', '')}
Years of Experience: {parsed_resume.get('years_experience', 0)}
Key Skills: {', '.join(parsed_resume.get('skills', [])[:15])}
Current/Last Role: {parsed_resume.get('experience', [{}])[0].get('title', 'N/A')} at {parsed_resume.get('experience', [{}])[0].get('company', 'N/A')}
Education: {parsed_resume.get('education', [{}])[0].get('degree', 'N/A')} from {parsed_resume.get('education', [{}])[0].get('school', 'N/A')}"""
    else:
        candidate_context = "No resume provided — generate general questions for the role."

    user_prompt = f"""JOB DETAILS:
Title: {job_title}
Company: {job_company}
Description:
{(job_description or 'No description provided')[:2500]}

CANDIDATE PROFILE:
{candidate_context}

Generate 10 targeted interview questions for this specific role and candidate."""

    try:
        response = await groq_service.call(
            user_prompt,
            system_prompt,
            meterUserId=user_id
        )
        parsed = groq_service.parse_json(response)
        if isinstance(parsed, list) and len(parsed) > 0:
            return parsed
    except Exception as e:
        logger.error(f"Interview generation failed: {e}")

    return get_fallback_questions(job_title)


def get_fallback_questions(job_title: str) -> List[Dict[str, Any]]:
    return [
        {
            "question": f"Walk me through your most complex project related to {job_title}.",
            "category": "technical",
            "tip": "Detail your technical decisions, trade-offs made, and the business impact."
        },
        {
            "question": "Describe a time you had to learn a new technology quickly under pressure.",
            "category": "behavioral",
            "tip": "Use STAR method. Show initiative, speed of learning, and outcome."
        },
        {
            "question": "How do you approach debugging a hard-to-reproduce production bug?",
            "category": "technical",
            "tip": "Cover: reproduction steps, logging strategy, hypothesis testing, fix, and prevention."
        },
        {
            "question": "Tell me about a time you disagreed with a technical decision and how you handled it.",
            "category": "behavioral",
            "tip": "Show diplomatic communication, data-driven reasoning, and teamwork."
        },
        {
            "question": "How do you ensure code quality in a fast-moving team?",
            "category": "role-specific",
            "tip": "Mention: code review culture, testing strategy, CI/CD, documentation."
        },
        {
            "question": "If you joined and found the codebase had significant technical debt, what would you do first?",
            "category": "situational",
            "tip": "Show pragmatism: assess impact, prioritize, communicate trade-offs, don't just rewrite everything."
        },
        {
            "question": "Explain a complex technical concept you recently learned in simple terms.",
            "category": "technical",
            "tip": "Shows communication skills and ability to teach peers — use an analogy."
        },
        {
            "question": "Describe your ideal engineering team and work environment.",
            "category": "behavioral",
            "tip": "Be genuine but align with collaboration, clear ownership, and growth opportunities."
        },
        {
            "question": "How do you prioritize when you have multiple urgent tasks?",
            "category": "situational",
            "tip": "Show: impact assessment, stakeholder communication, and systematic triage."
        },
        {
            "question": f"What excites you most about this role and what would you work on in your first 30 days?",
            "category": "role-specific",
            "tip": "Research the company's product and show you've thought about where you'd add value quickly."
        },
    ]