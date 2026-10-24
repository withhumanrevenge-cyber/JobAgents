# JobAgent API (Python)

FastAPI backend for JobAgent. The Next.js app is the UI; every `/api/...` call from the browser
comes here, authenticated with the user's Supabase access token (`Authorization: Bearer`). The
only server route left in Next.js is the Google sign-in callback (`app/api/auth/callback`),
because it has to set the session cookies.

## Layout

```
app/
  main.py            app, CORS, error handlers, routers
  config.py          settings from env (see .env.example)
  auth.py            Supabase token verification, admin check
  db.py              service-role Supabase client (bypasses RLS: always filter by user id)
  plans.json         plan limits and prices, shared with the frontend (lib/plans.ts)
  routers/           HTTP endpoints, same paths and JSON shapes the frontend already used
  services/          credits ledger, Groq, billing webhooks, email, match rows
  agents/            job sources (Adzuna, Greenhouse, Lever, Ashby), matching, writing, hiring,
                     Proof of Fit (proof.py)
  jobs/              daily_sync (cron), backfill_descriptions (one-off)
tests/
```

## Local development

```bash
cd backend
py -3.12 -m venv .venv            # or python3.12 -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # .venv/bin/pip on macOS/Linux
cp .env.example .env              # fill in Supabase, Groq, ...
.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

In the frontend's `.env.local`, set `NEXT_PUBLIC_API_URL=http://localhost:8000`. API docs are
at http://localhost:8000/docs outside production.

Tests and lint:

```bash
.venv/Scripts/python -m pytest
.venv/Scripts/ruff check app tests
```

## AI: your key or ours

Every AI request runs in one of three modes (`app/services/ai.py`):

| Mode | Who | Whose key | Credits |
|---|---|---|---|
| `byok` | Anyone who saved their own key (Free always uses it; paid plans can opt out) | The user's | None |
| `hosted` | Pro and Premium without a key (or with "Use my key" off) | Ours (`GROQ_API_KEY`) | Plan credits |
| `trial` | Free without a key | Ours | 6 a month; 25 jobs scored per search, 50 a day |

Supported providers: Groq, Google Gemini, OpenAI, OpenRouter (OpenAI-compatible endpoints,
`app/services/llm.py`) and Anthropic (official SDK, `app/services/llm_anthropic.py`). Base URLs
are fixed per provider. Keys are checked by listing the provider's models, encrypted with
`BYOK_ENCRYPTION_KEY` (Fernet) and stored in `user_ai_keys`, which browsers cannot read.
Resume parsing never spends credits. The daily sync matches paid users and Free users with a
key (unless they turned background matching off).

## Proof of Fit

A seeker answers three timed questions about a role (`app/agents/proof.py`). After each answer
the AI writes one follow-up from what they wrote, so a pasted generic answer meets a question it
couldn't anticipate. Grading scores each skill and keeps only evidence quotes that really appear
in the answers; paste and over-time flags are measured by the server, not judged by the model.

- Proofs always run on our Groq key, so every candidate is graded by the same model. They're
  capped by `proofsPerMonth` in `plans.json` and cost no credits.
- Recruiters invite candidates from a posting. Once a candidate finishes, the recruiter has the
  posting's `response_sla_days` (default 7) to advance or decline. Past it, the daily sync
  declines automatically with feedback from the report, and the miss lowers the recruiter's
  on-time decision rate.
- Contact details (email, phone, LinkedIn, and those fields inside the parsed resume) reach a
  recruiter only after they advance the candidate and the candidate accepts.
- Completed proofs can be shared at `/p/<slug>`: the report and quotes, never the full answers.

## Hosted AI resilience

- Each user's unscored jobs are ranked by overlap with their target roles and skills before any
  AI call; jobs with no overlap at all are never scored.
- At most `HOSTED_MAX_CONCURRENCY` calls run on our key at once (default 8).
- Set `HOSTED_FALLBACK_PROVIDER` (e.g. `gemini`), `HOSTED_FALLBACK_API_KEY`,
  `HOSTED_FALLBACK_FAST_MODEL` and `HOSTED_FALLBACK_MODEL` to retry hosted calls elsewhere when
  Groq errors or rate-limits. Users' own keys never fall back to ours.
- Set `SENTRY_DSN` to report errors (API and cron). No request bodies or IPs are sent.

## Database prerequisites

Run in the Supabase SQL editor, in order, before the first deploy: `supabase/migrations/009_schema_fixes.sql`,
`010_credits_functions.sql`, `011_user_ai_keys.sql`, `012_proof_of_fit.sql`, `013_admin_funnel.sql`, then `014_job_dedupe_key.sql`.
The backend calls `credits_used_this_month` and writes `profiles.last_matched_at` (010), stores users'
AI keys in `user_ai_keys` (011), Proof of Fit in `skill_proofs` and `candidate_matches` (012), and
reads the admin funnel from `admin_funnel()` (013), and groups duplicate postings by `jobs.dedupe_key` (014). 012 also makes `candidate_matches` read-only
from the browser.

## Deploying (Vercel)

The frontend and this backend deploy together as one Vercel project using
[Services](https://vercel.com/docs/services) (see `vercel.json` at the repo root): `/api/auth/*`
goes to Next.js (the Google sign-in callback), every other `/api/*` to this FastAPI app, and
everything else to Next.js. Same domain, so the browser needs no API URL and there's no CORS.

One-time setup in Vercel:

1. Project → Settings → General → Framework Preset: **Services** (Root Directory: the repo root).
2. Project → Settings → Environment Variables: add everything from `backend/.env.example` (with
   `APP_URL=https://getjobagents.xyz`, `ENVIRONMENT=production`), next to the `NEXT_PUBLIC_*`
   ones. Leave `NEXT_PUBLIC_API_URL` unset.
3. Payment dashboards: webhooks go to `https://getjobagents.xyz/api/webhooks/razorpay` and
   `/api/webhooks/lemonsqueezy`.

Vercel limits that shaped the code:

- Functions end after 300 s. The daily sync (Vercel Cron, `/api/cron/sync`, sends
  `Authorization: Bearer $CRON_SECRET`) runs inside the request with a 220 s budget, least
  recently matched users first, so users that don't fit get matched first the next day.
- Request bodies are capped at 4.5 MB, so resumes are limited to 4 MB.
- Nothing stays in memory between instances: rate limits and the per-user/per-proof locks are
  per instance. Good enough at this size; move them to Redis or the database if abuse shows up.

`render.yaml` and the `Dockerfile` still work for running the backend as a long-lived server
elsewhere; then set `NEXT_PUBLIC_API_URL` on Vercel to that server's URL.

One-off cleanup of job descriptions stored as escaped HTML (dry run, then `--apply`), from your
machine with `backend/.env` filled in: `python -m app.jobs.backfill_descriptions`.
