# backend/app/services/email_service.py
import logging
from typing import List, Dict, Any, Optional
from resend import Resend
from app.core.config import settings

logger = logging.getLogger(__name__)


def get_resend_client() -> Optional[Resend]:
    key = settings.RESEND_API_KEY
    if not key or key.startswith("re_your-"):
        return None
    return Resend(key)


def escape_html(s: str) -> str:
    return s.replace("&", "&").replace("<", "<").replace(">", ">").replace('"', """).replace("'", "'")


async def send_match_digest(
    to: str,
    name: str,
    matches: List[Dict[str, Any]]
) -> Dict[str, Any]:
    client = get_resend_client()
    if not client:
        return {"sent": False, "reason": "RESEND_API_KEY not configured"}
    if not to:
        return {"sent": False, "reason": "no recipient email"}
    if not matches:
        return {"sent": False, "reason": "no matches to send"}

    app_url = settings.NEXT_PUBLIC_APP_URL or "http://localhost:3000"
    top = matches[:10]
    first_name = name.split(" ")[0] if name else "there"

    subject = (
        f"1 job matched your resume — {top[0]['job'].get('title', 'Open to see')}"
        if len(matches) == 1
        else f"{len(matches)} new jobs matched {first_name + ('' if first_name == 'there' else \"'s\")} resume"
    )

    rows = []
    for m in top:
        job = m.get("job", {})
        if not job:
            continue
        job_type_label = {
            "remote": "Remote",
            "hybrid": "Hybrid",
            "onsite": "On-site",
        }.get(job.get("job_type"), "")
        location_line = " · ".join(filter(None, [job.get("location"), job_type_label]))
        
        rows.append(f"""
            <tr>
                <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
                    <a href="{app_url}/jobs/{job.get('id')}" style="color:#111;text-decoration:none;font-weight:500;font-size:14px;">{escape_html(job.get('title', ''))}</a>
                    <div style="color:#666;font-size:12px;margin-top:2px;">{escape_html(job.get('company', ''))}{f' · {escape_html(location_line)}' if location_line else ''}</div>
                </td>
                <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:top;">
                    <span style="background:#f0f9f0;border:1px solid #d4e8d4;color:#2d6a2d;font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;">{m.get('match_score', 0)}% match</span>
                </td>
            </tr>""")

    headline = "1 job matched your resume" if len(matches) == 1 else f"{len(matches)} jobs matched your resume"
    subhead = (
        "Here's the role we scored above your threshold. Open it to see the breakdown, tailor your resume, or prep for the interview."
        if len(matches) == 1
        else f"Here { 'is the role' if len(top) == 1 else f'are the top {len(top)} roles'} we scored above your threshold. Open any of them to see the breakdown, tailor your resume, or prep for the interview."
    )

    html = f"""<!doctype html>
<html><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #eaeaea;border-radius:8px;padding:32px;">
    <p style="font-size:14px;color:#666;margin:0 0 4px;">JobAgent</p>
    <h1 style="font-size:20px;margin:0 0 8px;">Hi {escape_html(first_name)}, {headline}</h1>
    <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.5;">{subhead}</p>
    <table style="width:100%;border-collapse:collapse;">{''.join(rows)}</table>
    <div style="margin-top:24px;text-align:center;">
      <a href="{app_url}/jobs" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:6px;">Open dashboard →</a>
    </div>
    <p style="font-size:11px;color:#999;margin:32px 0 0;text-align:center;">You're receiving this because the email digest is on. <a href="{app_url}/settings" style="color:#666;">Manage in settings.</a></p>
  </div>
</body></html>"""

    text_lines = []
    for m in top:
        job = m.get("job", {})
        if not job:
            continue
        job_type_label = {
            "remote": "Remote",
            "hybrid": "Hybrid",
            "onsite": "On-site",
        }.get(job.get("job_type"), "")
        location_line = " · ".join(filter(None, [job.get("location"), job_type_label]))
        text_lines.append(f"· {job.get('title')} — {job.get('company')}{f' ({location_line})' if location_line else ''} — {m.get('match_score', 0)}% match — {app_url}/jobs/{job.get('id')}")

    text = f"""Hi {first_name},

{headline}:

{chr(10).join(text_lines)}

Open dashboard: {app_url}/jobs
Manage notifications: {app_url}/settings
"""

    try:
        result = client.emails.send({
            "from": settings.RESEND_FROM or "JobAgent <onboarding@resend.dev>",
            "to": to,
            "subject": subject,
            "html": html,
            "text": text,
        })
        return {"sent": True, "id": result.get("id")}
    except Exception as e:
        logger.error(f"Failed to send digest email: {e}")
        return {"sent": False, "reason": str(e)}


async def send_test_email(to: str, name: str) -> Dict[str, Any]:
    client = get_resend_client()
    if not client:
        return {"sent": False, "reason": "RESEND_API_KEY not configured"}
    if not to:
        return {"sent": False, "reason": "no recipient email"}

    app_url = settings.NEXT_PUBLIC_APP_URL or "http://localhost:3000"
    first_name = name.split(" ")[0] if name else "there"

    try:
        result = client.emails.send({
            "from": settings.RESEND_FROM or "JobAgent <onboarding@resend.dev>",
            "to": to,
            "subject": "JobAgent — email notifications are on",
            "html": f"<p>Hi {escape_html(first_name)},</p><p>Email notifications are wired up correctly. After every background job search, you'll get a digest of jobs that matched your resume above your threshold.</p><p><a href='{app_url}/dashboard'>Open dashboard →</a></p>",
            "text": f"Hi {first_name},\n\nEmail notifications are wired up correctly. After every background job search, you'll get a digest of jobs that matched your resume above your threshold.\n\n{app_url}/dashboard",
        })
        return {"sent": True, "id": result.get("id")}
    except Exception as e:
        logger.error(f"Failed to send test email: {e}")
        return {"sent": False, "reason": str(e)}