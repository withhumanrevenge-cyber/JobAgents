import { Resend } from "resend"
import { Match } from "@/types"

const FROM_ADDRESS = process.env.RESEND_FROM || "JobAgent <onboarding@resend.dev>"
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "")

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key || key.startsWith("re_your-")) return null
  return new Resend(key)
}

interface DigestArgs {
  to: string
  name: string
  matches: Match[]
}

export async function sendMatchDigest({ to, name, matches }: DigestArgs): Promise<{ sent: boolean; reason?: string }> {
  const client = getClient()
  if (!client) return { sent: false, reason: "RESEND_API_KEY not configured" }
  if (!to) return { sent: false, reason: "no recipient email" }
  if (matches.length === 0) return { sent: false, reason: "no matches to send" }

  const top = matches.slice(0, 10)
  const firstName = name.split(" ")[0] || "there"

  const subject = matches.length === 1
    ? `1 job matched your resume — ${top[0].job?.title || "Open to see"}`
    : `${matches.length} new jobs matched ${firstName === "there" ? "your resume" : firstName + "'s resume"}`

  const { error } = await client.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html: renderDigestHtml({ firstName, total: matches.length, top }),
    text: renderDigestText({ firstName, total: matches.length, top }),
  })

  if (error) return { sent: false, reason: error.message }
  return { sent: true }
}

export async function sendTestEmail(to: string, name: string): Promise<{ sent: boolean; reason?: string }> {
  const client = getClient()
  if (!client) return { sent: false, reason: "RESEND_API_KEY not configured" }
  if (!to) return { sent: false, reason: "no recipient email" }

  const firstName = name.split(" ")[0] || "there"
  const { error } = await client.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "JobAgent — email notifications are on",
    html: `<p>Hi ${escape(firstName)},</p>
<p>Email notifications are wired up correctly. After every background job search, you'll get a digest of jobs that matched your resume above your threshold.</p>
<p><a href="${APP_URL}/dashboard">Open dashboard →</a></p>`,
    text: `Hi ${firstName},\n\nEmail notifications are wired up correctly. After every background job search, you'll get a digest of jobs that matched your resume above your threshold.\n\n${APP_URL}/dashboard`,
  })

  if (error) return { sent: false, reason: error.message }
  return { sent: true }
}

function renderDigestHtml({ firstName, total, top }: { firstName: string; total: number; top: Match[] }): string {
  const rows = top.map((m) => {
    const job = m.job
    if (!job) return ""
    const jobTypeLabel = job.job_type === "remote" ? "Remote"
      : job.job_type === "hybrid" ? "Hybrid"
      : job.job_type === "onsite" ? "On-site"
      : ""
    const locationLine = [job.location, jobTypeLabel].filter(Boolean).join(" · ")
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
          <a href="${APP_URL}/jobs/${job.id}" style="color:#111;text-decoration:none;font-weight:500;font-size:14px;">${escape(job.title)}</a>
          <div style="color:#666;font-size:12px;margin-top:2px;">${escape(job.company)}${locationLine ? ` · ${escape(locationLine)}` : ""}</div>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:top;">
          <span style="background:#f0f9f0;border:1px solid #d4e8d4;color:#2d6a2d;font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;">${m.match_score}% match</span>
        </td>
      </tr>`
  }).join("")

  const headline = total === 1
    ? `1 job matched your resume`
    : `${total} jobs matched your resume`

  const subhead = total === 1
    ? `Here's the role we scored above your threshold. Open it to see the breakdown, tailor your resume, or prep for the interview.`
    : `Here ${top.length === 1 ? "is the role" : `are the top ${top.length} roles`} we scored above your threshold. Open any of them to see the breakdown, tailor your resume, or prep for the interview.`

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #eaeaea;border-radius:8px;padding:32px;">
    <p style="font-size:14px;color:#666;margin:0 0 4px;">JobAgent</p>
    <h1 style="font-size:20px;margin:0 0 8px;">Hi ${escape(firstName)}, ${headline}</h1>
    <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.5;">${subhead}</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <div style="margin-top:24px;text-align:center;">
      <a href="${APP_URL}/jobs" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:6px;">Open dashboard →</a>
    </div>
    <p style="font-size:11px;color:#999;margin:32px 0 0;text-align:center;">You're receiving this because the email digest is on. <a href="${APP_URL}/settings" style="color:#666;">Manage in settings.</a></p>
  </div>
</body></html>`
}

function renderDigestText({ firstName, total, top }: { firstName: string; total: number; top: Match[] }): string {
  const lines = top.map((m) => {
    if (!m.job) return ""
    const jobTypeLabel = m.job.job_type === "remote" ? "Remote"
      : m.job.job_type === "hybrid" ? "Hybrid"
      : m.job.job_type === "onsite" ? "On-site"
      : ""
    const locationLine = [m.job.location, jobTypeLabel].filter(Boolean).join(" · ")
    return `· ${m.job.title} — ${m.job.company}${locationLine ? ` (${locationLine})` : ""} — ${m.match_score}% match — ${APP_URL}/jobs/${m.job.id}`
  }).filter(Boolean)
  const headline = total === 1 ? `1 job matched your resume` : `${total} jobs matched your resume`
  return `Hi ${firstName},\n\n${headline}:\n\n${lines.join("\n")}\n\nOpen dashboard: ${APP_URL}/jobs\nManage notifications: ${APP_URL}/settings\n`
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}
