# JobAgent — Product Walkthrough

A guided tour of everything in the app, in the order a real person meets it.
Live at **[getjobagents.xyz](https://getjobagents.xyz)**.

---

## 1. First visit (logged out)

- **Landing page (`/`)** — hero ("Find jobs that match who you actually are"), feature cards (Resume Parser, Job Matching, Resume Tailoring, Interview Prep), pricing section, and footer links (Pricing, Privacy, Terms).
- **Pricing (`/pricing`)** — three tiers. Visitors from India see ₹0 / ₹399 / ₹799; everyone else sees $0 / $12 / $24 (detected automatically from the visitor's location).
- **For employers** (top nav) — routes recruiters straight into a hiring-flavored signup.
- Sign up with **email + password** or **Google**.

## 2. Onboarding

First screen asks: **"I'm looking for a job"** or **"I'm hiring."**

**Job seeker path (3 steps):**
1. **Your details** — name, email, phone, LinkedIn.
2. **Upload resume** — drop a PDF; the AI extracts skills, experience, education, and target role in seconds. Add up to 5 target roles and pick a target country.
3. **Preferences** — match-score threshold slider (default 70%): jobs scoring below it are hidden.

Finishing kicks off a background job search so the dashboard isn't empty on arrival.

**Recruiter path (1 step):** name + company + candidate match threshold → straight to the hiring dashboard.

## 3. Dashboard (`/dashboard`)

- Four stats: **Jobs in feed** (last 30 days), **Matched**, **Applied**, **Interviews**.
- **Top matches** — your five best-scoring jobs with one-click access.
- **Recent activity** feed of new matches.
- If no resume is uploaded yet, a banner nudges you to add one — matching can't run without it.

## 4. Jobs (`/jobs`)

- **Find new jobs** (top bar) — pulls fresh listings from Remotive, Adzuna, and JSearch for your target roles and country, then AI-scores each one against your resume (0–100) with live progress ("Matching… N left").
  - If you've set the **country filter** to a specific country, the search fetches for *that* country; otherwise it uses your Settings country.
- **Filters** — Remote/Hybrid/On-site tabs, search, country, region, experience level, posted date (24h / 7d / 30d), status, source.
- Table or card view. Each row: role, **match score badge**, location, posted date, status.
- Free plan shows the top 25 matches; Pro/Premium show more (an upgrade banner appears when matches are locked).

## 5. Job detail (`/jobs/[id]`)

The money page. For any job:
- **Match panel** — score, one-line AI reasoning, matched skills vs missing skills.
- **Tailor resume** — rewrites your resume for this exact job description, with an **ATS score**; edit and export as PDF.
- **Smart Apply** — one click generates the tailored resume **and** a personalized cover letter, in a slide-over panel with copy buttons, then links you to the original apply page.
- **Interview prep** — 10 role-specific questions (technical / behavioral / situational) with coaching tips, in a collapsible accordion.
- **Mark applied** — records it in your tracker (works even for unscored jobs).

Paid actions consume monthly **credits** (Smart Apply 3 · tailor 2 · interview 2); matching and resume parsing are always free.

## 6. Applications (`/applications`)

Your pipeline. Every applied job with score, applied date, and a stage dropdown — **Applied → Interview → Offer / Rejected** — plus free-text notes per application.

## 7. Settings (`/settings`)

- Profile details, target roles, target country, match threshold.
- **Resume** — re-upload any time; shows parsed status (role, years, skill count).
- **Open to work** toggle — opt into the recruiter talent pool (recruiters can then discover you with your resume summary and contact details).
- **Email digest** — daily email of new high-fit matches, with a send-test button.
- **Plan & credits** — current tier, credit usage bar, upgrade buttons (UPI/India via Razorpay, card via Lemon Squeezy — each appears once configured).
- **Account type** — switch to a recruiter account (or back).

## 8. Hiring dashboard (`/hire`) — recruiters only

- **Post a role** — title, company, location, type, seniority, description, skills, salary.
- **Find candidates** — AI scans the opt-in talent pool and scores every candidate against the role (0–100) with reasoning and matched/missing skills.
- **Min match score slider** — set it to 85% and only serious fits remain visible; your preference is remembered.
- Candidate pipeline: **New → Shortlisted → Contacted → Rejected**, with one-click email contact.

## 9. Admin (`/admin`) — owner only

- Totals: users, estimated MRR, credits spent this month, AI tokens consumed, active users.
- Per-user table: plan, usage breakdown, token spend — with manual plan override and bonus-credit grants.

## 10. Behind the scenes

- **Daily cron (6:00 UTC)** — refreshes the job pool for every user's roles/countries, tops up Indian listings, scores new jobs for digest subscribers, and sends match-digest emails.
- **Jobs stay fresh** — anything older than 30 days is never stored or shown.
- **Plans**: Free (15 credits/mo, Remotive only, top 25 matches) · Pro ₹399/$12 (100 credits, all sources & countries, 150 matches) · Premium ₹799/$24 (300 credits, 300 jobs scored/run, 2,000 matches).
- Payments: Razorpay (UPI/INR) + Lemon Squeezy (global cards), webhook-driven; the plan updates automatically on payment.
