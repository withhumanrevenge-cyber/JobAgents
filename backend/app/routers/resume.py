import asyncio
import io
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, UploadFile
from pypdf import PdfReader

from app.auth import AuthUser
from app.db import first, get_db
from app.errors import ApiError
from app.ratelimit import ai_user, general_user
from app.services.ai import get_ai
from app.services.llm import parse_json

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/resume", tags=["resume"])

MAX_BYTES = 10 * 1024 * 1024
SIGNED_URL_TTL_S = 300

SYSTEM_PROMPT = """You are an expert resume parser. Extract all relevant information from the resume text below.
Return ONLY a valid JSON object in this exact shape, no markdown, no extra text:
{
  "name": "<full name>",
  "email": "<email address>",
  "phone": "<phone number>",
  "target_role": "<the job title/role this person is targeting, inferred from their most recent title and experience>",
  "years_experience": <integer, total years of professional experience>,
  "summary": "<professional summary or objective, 2-3 sentences>",
  "skills": ["<skill1>", "<skill2>", ...],
  "experience": [{"company": "<company name>", "title": "<job title>", "dates": "<start - end dates>", "bullets": ["<responsibility or achievement>", ...]}],
  "education": [{"school": "<school name>", "degree": "<degree and field>", "year": "<graduation year>"}],
  "certifications": ["<cert name>", ...],
  "projects": [{"name": "<project name>", "description": "<what it does>", "tech": ["<tech used>"], "url": "<url if present>"}]
}
If a field is not present in the resume, use an empty string or empty array. Do not invent data."""


def _extract_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages).strip()


@router.post("/parse")
async def parse_resume(resume: UploadFile = File(...), user: AuthUser = Depends(ai_user)) -> dict:
    data = await resume.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ApiError(400, "Resume must be under 10MB.")
    if resume.content_type != "application/pdf" or not data.startswith(b"%PDF"):
        raise ApiError(400, "Only PDF resumes are supported.")

    try:
        text = await asyncio.to_thread(_extract_text, data)
    except Exception as e:
        log.info("PDF extraction failed: %s", e)
        raise ApiError(422, "Could not read this PDF. Make sure it contains selectable text (not a scanned image).") from None
    if len(text) < 50:
        raise ApiError(422, "Resume appears to be a scanned image. Please use a text-based PDF.")

    # Parsing never spends credits: nothing else works without a resume, so even the Free trial
    # gets it on our key.
    ai = await get_ai(user.id)
    parsed = parse_json(await ai.call(f"Extract all information from this resume:\n\n{text[:6000]}", SYSTEM_PROMPT))
    if not isinstance(parsed, dict) or not parsed.get("name"):
        raise ApiError(422, "Could not parse resume. Please ensure the PDF contains readable text.")

    db = await get_db()
    path = f"{user.id}/resume_{int(time.time() * 1000)}.pdf"
    try:
        await db.storage.from_("resumes").upload(path, data, {"content-type": "application/pdf", "upsert": "true"})
    except Exception:
        # Don't save a path to a file that doesn't exist: "View resume" would break.
        log.exception("resume upload failed")
        raise ApiError(502, "Couldn't store your resume. Please try again.") from None

    profile = await first(db.table("profiles").select("full_name, email, phone").eq("user_id", user.id)) or {}
    fields = {
        "parsed_resume": parsed,
        "resume_parsed_at": datetime.now(timezone.utc).isoformat(),
        "base_resume_url": path,
    }
    # Fill contact details from the resume only where the user hasn't set them.
    for key, value in (("full_name", parsed.get("name")), ("email", parsed.get("email")), ("phone", parsed.get("phone"))):
        if value and not profile.get(key):
            fields[key] = value
    await db.table("profiles").update(fields).eq("user_id", user.id).execute()

    return {"parsed_resume": parsed, "resume_url": path}


@router.get("/url")
async def resume_url(user: AuthUser = Depends(general_user)) -> dict:
    db = await get_db()
    profile = await first(db.table("profiles").select("base_resume_url").eq("user_id", user.id))
    stored = (profile or {}).get("base_resume_url")
    if not stored:
        raise ApiError(404, "No resume on file.")

    # Rows from before the bucket went private hold a full public URL; newer ones the path.
    path = stored.split("/resumes/", 1)[1].split("?", 1)[0] if "/resumes/" in stored else stored
    if not path.startswith(f"{user.id}/"):
        raise ApiError(403, "Forbidden")

    try:
        res = await db.storage.from_("resumes").create_signed_url(path, SIGNED_URL_TTL_S)
    except Exception:
        log.exception("signed url failed")
        raise ApiError(500, "Could not generate a link for this resume.") from None
    url = res.get("signedURL") or res.get("signedUrl") if isinstance(res, dict) else getattr(res, "signed_url", None)
    if not url:
        raise ApiError(500, "Could not generate a link for this resume.")
    return {"url": url}
