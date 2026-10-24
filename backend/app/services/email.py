"""Transactional email through Resend's REST API."""

import html
import logging
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

_TYPE_LABEL = {"remote": "Remote", "hybrid": "Hybrid", "onsite": "On-site"}


async def _send(to: str, subject: str, html_body: str, text_body: str) -> tuple[bool, str | None]:
    s = get_settings()
    if not s.RESEND_API_KEY:
        return False, "RESEND_API_KEY not configured"
    if not to:
        return False, "no recipient email"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {s.RESEND_API_KEY}"},
                json={"from": s.RESEND_FROM, "to": to, "subject": subject, "html": html_body, "text": text_body},
            )
    except httpx.HTTPError as e:
        return False, str(e)
    if res.status_code >= 300:
        log.warning("Resend returned %s: %s", res.status_code, res.text[:300])
        return False, "email provider rejected the message"
    return True, None


def _location_line(job: dict[str, Any]) -> str:
    return " · ".join(x for x in [job.get("location"), _TYPE_LABEL.get(job.get("job_type") or "")] if x)


async def send_match_digest(to: str, name: str, matches: list[dict[str, Any]]) -> tuple[bool, str | None]:
    if not matches:
        return False, "no matches to send"
    app_url = get_settings().APP_URL
    first_name = (name or "").split(" ")[0] or "there"
    top = [m for m in matches[:10] if m.get("job")]
    total = len(matches)
    e = html.escape

    if total == 1:
        subject = f"1 job matched your resume: {top[0]['job']['title'] if top else 'open to see'}"
        headline = "1 job matched your resume"
    else:
        whose = "your resume" if first_name == "there" else f"{first_name}'s resume"
        subject = f"{total} new jobs matched {whose}"
        headline = f"{total} jobs matched your resume"

    rows = "".join(
        f"""<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
<a href="{app_url}/jobs/{m['job']['id']}" style="color:#111;text-decoration:none;font-weight:500;font-size:14px;">{e(m['job']['title'])}</a>
<div style="color:#666;font-size:12px;margin-top:2px;">{e(m['job']['company'])}{(' · ' + e(_location_line(m['job']))) if _location_line(m['job']) else ''}</div></td>
<td style="padding:12px 0;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:top;">
<span style="background:#f0f9f0;border:1px solid #d4e8d4;color:#2d6a2d;font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;">{m['match_score']}% match</span></td></tr>"""
        for m in top
    )
    html_body = f"""<!doctype html><html><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #eaeaea;border-radius:8px;padding:32px;">
<p style="font-size:14px;color:#666;margin:0 0 4px;">JobAgent</p>
<h1 style="font-size:20px;margin:0 0 8px;">Hi {e(first_name)}, {headline}</h1>
<p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.5;">Open any of them to see the breakdown, tailor your resume, or prep for the interview.</p>
<table style="width:100%;border-collapse:collapse;">{rows}</table>
<div style="margin-top:24px;text-align:center;"><a href="{app_url}/jobs" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:6px;">Open dashboard →</a></div>
<p style="font-size:11px;color:#999;margin:32px 0 0;text-align:center;">You're receiving this because the email digest is on. <a href="{app_url}/settings" style="color:#666;">Manage in settings.</a></p>
</div></body></html>"""
    lines = "\n".join(
        f"· {m['job']['title']} - {m['job']['company']}"
        f"{(' (' + _location_line(m['job']) + ')') if _location_line(m['job']) else ''}"
        f" - {m['match_score']}% match - {app_url}/jobs/{m['job']['id']}"
        for m in top
    )
    text_body = f"Hi {first_name},\n\n{headline}:\n\n{lines}\n\nOpen dashboard: {app_url}/jobs\nManage notifications: {app_url}/settings\n"
    return await _send(to, subject, html_body, text_body)


async def send_test_email(to: str, name: str) -> tuple[bool, str | None]:
    app_url = get_settings().APP_URL
    first_name = (name or "").split(" ")[0] or "there"
    body = "Email notifications are wired up correctly. After every background job search, you'll get a digest of jobs that matched your resume above your threshold."
    return await _send(
        to,
        "JobAgent: email notifications are on",
        f'<p>Hi {html.escape(first_name)},</p><p>{body}</p><p><a href="{app_url}/dashboard">Open dashboard →</a></p>',
        f"Hi {first_name},\n\n{body}\n\n{app_url}/dashboard",
    )


async def send_followup(to: str, name: str, jobs: list[dict[str, Any]]) -> tuple[bool, str | None]:
    """A week after applying: did you hear back? Updating the status is how interview rate is measured."""
    app_url = get_settings().APP_URL
    first_name = (name or "").split(" ")[0] or "there"
    e = html.escape
    if len(jobs) == 1:
        subject = f"Did you hear back from {jobs[0]['company']}?"
        lead = f"You applied to {jobs[0]['title']} at {jobs[0]['company']} a week ago."
    else:
        subject = f"Did you hear back on your {len(jobs)} applications?"
        lead = f"You applied to {len(jobs)} jobs a week ago."
    items = "".join(f"<li>{e(j['title'])} at {e(j['company'])}</li>" for j in jobs[:10])
    html_body = (
        f'<p>Hi {e(first_name)},</p><p>{e(lead)} If any of them called you for an interview, mark it in your tracker. '
        f"It helps us show you better matches.</p><ul>{items}</ul>"
        f'<p><a href="{app_url}/applications">Update my applications →</a></p>'
        f'<p style="font-size:11px;color:#999">You get this because email notifications are on. '
        f'<a href="{app_url}/settings">Manage in settings.</a></p>'
    )
    text_items = "\n".join(f"· {j['title']} at {j['company']}" for j in jobs[:10])
    text_body = (f"Hi {first_name},\n\n{lead} If any of them called you for an interview, "
                 f"mark it in your tracker.\n\n{text_items}\n\n{app_url}/applications\n")
    return await _send(to, subject, html_body, text_body)


async def send_proof_invite(to: str, name: str, posting: dict[str, Any]) -> tuple[bool, str | None]:
    """A recruiter invited a candidate to prove their fit for a role."""
    app_url = get_settings().APP_URL
    first_name = (name or "").split(" ")[0] or "there"
    e = html.escape
    role = f"{posting['title']} at {posting['company']}"
    sla = posting.get("response_sla_days") or 7
    subject = f"{posting['company']} invited you to show your fit for {posting['title']}"
    html_body = (
        f"<p>Hi {e(first_name)},</p><p>{e(posting['company'])} saw your profile and invited you to a short "
        f"Proof of Fit for <strong>{e(role)}</strong>: three questions about the work itself, about 15 minutes.</p>"
        f"<p>Once you finish, they have {sla} days to give you a decision. If they don't, you get feedback "
        "on your answers anyway. Your contact details are shared only if they move you forward and you accept.</p>"
        f'<p><a href="{app_url}/proofs">Start my Proof of Fit →</a></p>'
        f'<p style="font-size:11px;color:#999">You get this because you joined the talent pool. '
        f'<a href="{app_url}/settings">Leave it in settings.</a></p>'
    )
    text_body = (f"Hi {first_name},\n\n{posting['company']} invited you to a short Proof of Fit for {role}: "
                 f"three questions, about 15 minutes. They have {sla} days to decide once you finish.\n\n"
                 f"{app_url}/proofs\n")
    return await _send(to, subject, html_body, text_body)


async def send_proof_decision(to: str, name: str, posting: dict[str, Any], decision: str,
                              feedback: str | None) -> tuple[bool, str | None]:
    """The recruiter's decision on a finished proof (or the automatic one past the deadline)."""
    app_url = get_settings().APP_URL
    first_name = (name or "").split(" ")[0] or "there"
    e = html.escape
    role = f"{posting['title']} at {posting['company']}"
    if decision == "advanced":
        subject = f"{posting['company']} wants to talk to you about {posting['title']}"
        lead = (f"Good news: {posting['company']} wants to move forward with you for {role}. "
                "Accept the introduction to share your contact details with them.")
    else:
        subject = f"An update on {role}"
        lead = f"{posting['company']} won't be moving forward with you for {role}."
    fb = f"<p><strong>Feedback:</strong> {e(feedback)}</p>" if feedback else ""
    html_body = (f"<p>Hi {e(first_name)},</p><p>{e(lead)}</p>{fb}"
                 f'<p><a href="{app_url}/proofs">Open my proofs →</a></p>')
    text_body = f"Hi {first_name},\n\n{lead}\n\n{('Feedback: ' + feedback + chr(10) + chr(10)) if feedback else ''}{app_url}/proofs\n"
    return await _send(to, subject, html_body, text_body)
