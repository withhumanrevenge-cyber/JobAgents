# JobAgent Python Backend

FastAPI-based backend for JobAgent - AI-powered job matching platform.

## Features

- **Authentication**: Email/password with JWT tokens
- **Resume Parsing**: PDF text extraction + Groq LLM parsing
- **Job Aggregation**: Adzuna API + Greenhouse/Lever/Ashby ATS scraping
- **AI Matching**: Groq-powered job scoring against user resume
- **Smart Apply**: Tailored resume + cover letter generation
- **Interview Prep**: Role-specific interview questions
- **Billing**: Razorpay (INR) + Lemon Squeezy (USD) with webhook handling
- **Hiring Dashboard**: Recruiter job postings with AI candidate matching
- **Admin Panel**: User management, plan control, analytics
- **Background Jobs**: Cron job for daily sync + digests
- **Rate Limiting**: Per-endpoint rate limits with Redis fallback
- **Security**: HMAC webhook verification, CSP headers, input validation

## Quick Start

### Prerequisites

- Python 3.11+
- Supabase project
- Groq API key
- Adzuna API credentials (optional for dev)
- Resend API key (optional for dev)
- Razorpay + Lemon Squeezy accounts (for payments)

### Installation

```bash
cd backend
pip install -e ".[dev]"
cp .env.example .env
# Edit .env with your credentials
```

### Development

```bash
# Run with auto-reload
uvicorn app.main:app --reload --port 8000

# Or use the script
python -m app.main
```

### Production

```bash
# Install production dependencies
pip install -e .

# Run with gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## Environment Variables

See `.env.example` for all required variables.

Key variables:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` - Supabase credentials
- `GROQ_API_KEY` - Groq API key for AI
- `CRON_SECRET` - Secret for cron endpoint authentication
- `SECRET_KEY` - JWT signing key (min 32 chars)
- `ADMIN_EMAILS` - Comma-separated admin emails

## API Endpoints

### Authentication
- `POST /api/v1/auth/signup` - Register new user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user profile

### Profile
- `GET /api/v1/profile` - Get profile
- `PUT /api/v1/profile` - Update profile
- `POST /api/v1/profile/resume/parse` - Upload and parse resume
- `GET /api/v1/profile/resume/url` - Get signed resume URL

### Jobs
- `POST /api/v1/jobs/fetch` - Sync jobs from sources
- `POST /api/v1/jobs/match` - Score jobs against resume
- `GET /api/v1/jobs` - List matched jobs
- `GET /api/v1/jobs/{job_id}` - Get job detail
- `POST /api/v1/jobs/{job_id}/apply` - Mark as applied

### Apply
- `POST /api/v1/apply/smart` - Tailored resume + cover letter
- `POST /api/v1/apply/resume/tailor` - Tailored resume only

### Interview
- `POST /api/v1/interview/generate` - Generate interview questions

### Billing
- `POST /api/v1/billing/razorpay/checkout` - Create Razorpay subscription
- `POST /api/v1/billing/lemonsqueezy/checkout` - Create Lemon Squeezy checkout
- `GET /api/v1/billing/credits` - Get credit balance
- `POST /api/v1/billing/webhooks/razorpay` - Razorpay webhook
- `POST /api/v1/billing/webhooks/lemonsqueezy` - Lemon Squeezy webhook

### Hiring (Recruiter)
- `GET /api/v1/hire` - List postings
- `POST /api/v1/hire` - Create posting
- `GET /api/v1/hire/{posting_id}` - Get posting
- `POST /api/v1/hire/{posting_id}/match-candidates` - Score candidates
- `GET /api/v1/hire/{posting_id}/candidates` - Get matched candidates

### Admin
- `GET /api/v1/admin/overview` - Dashboard stats
- `GET /api/v1/admin/users` - List users with usage
- `POST /api/v1/admin/set-plan` - Set user plan
- `POST /api/v1/admin/grant-credits` - Grant bonus credits

### Cron
- `GET /api/v1/cron/sync` - Daily sync (requires `Authorization: Bearer <CRON_SECRET>`)

## Database Schema

Run the SQL migrations from the TypeScript version's `supabase/` folder in your Supabase SQL editor:
1. `schema.sql` - Core tables
2. `migrations/002_onboarding_columns.sql` - Profile columns
3. `migrations/003_hiring.sql` - Hiring tables
4. `migrations/004_match_score_sentinel.sql` - Match score fix
5. `migrations/005_storage_security.sql` - Storage policies
6. `migrations/006_usage_events.sql` - Usage ledger
7. `migrations/007_private_resumes.sql` - Private bucket
8. `migrations/008_webhook_idempotency.sql` - Webhook dedup (new)

## Storage

Create a Supabase Storage bucket named `resumes` and apply the policies from `migrations/005_storage_security.sql` and `007_private_resumes.sql`.

## Rate Limits

- AI endpoints: 10 req/min
- Auth endpoints: 5 req/min
- General: 60 req/min

Configured in `app/core/rate_limit.py`. Requires Redis for production.

## Deployment

### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install -e .
COPY . .
CMD ["gunicorn", "app.main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

### Vercel/Cloud Functions

FastAPI works with serverless platforms. Use `mangum` for AWS Lambda or native support on Vercel.

## Testing

```bash
pytest tests/ -v --cov=app
```

## Project Structure

```
backend/
├── app/
│   ├── api/v1/          # API routes
│   ├── agents/          # AI agents (job_fetcher, matching, resume, etc.)
│   ├── core/            # Config, security, database, rate limiting
│   ├── lib/             # Utilities (env validation, ATS companies)
│   ├── schemas/         # Pydantic models
│   ├── services/        # Business logic (Supabase, Groq, Email, Billing, PDF)
│   ├── main.py          # FastAPI app
│   └── lib/env_validation.py
├── tests/               # Pytest tests
├── alembic/             # Database migrations (if using SQLAlchemy directly)
├── pyproject.toml
└── .env.example
```

## Security Notes

- All webhook endpoints verify HMAC signatures
- Cron endpoint only accepts `Authorization: Bearer` header (no query string)
- Webhook idempotency via `webhook_events` table
- Admin requires both email allowlist AND `is_admin` DB flag
- CSP headers configured in middleware
- Rate limiting on all API endpoints
- Error messages sanitized in production

## Migration from TypeScript

This Python backend is a functional equivalent of the TypeScript/Next.js version. Key differences:

1. **Framework**: FastAPI instead of Next.js API routes
2. **Database**: Direct Supabase client instead of SSR helpers
3. **Auth**: JWT tokens instead of Supabase SSR cookies
4. **Background Jobs**: Cron endpoint + external scheduler (Vercel Cron, GitHub Actions, etc.)
5. **Rate Limiting**: Middleware with Redis fallback
6. **PDF Processing**: pdfplumber + PyPDF2 instead of unpdf
7. **HTML Sanitization**: Custom recursive decoder instead of DOMPurify

## License

MIT