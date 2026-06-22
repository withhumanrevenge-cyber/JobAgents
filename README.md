# AI Job Agent

AI Job Agent is a full-stack job application automation platform designed to make finding and applying for roles faster and more effective. By aggregating jobs, scoring them against your resume, and auto-tailoring applications using LLMs, this tool aims to put your job search on autopilot.

## Features

- 🕵️ **Intelligent Job Aggregation**: Fetches and deduplicates job listings from Remotive, Adzuna, and JSearch.
- 🎯 **AI Match Scoring**: Automatically scores incoming roles based on your resume, skills, and experience level using fast LLM inference.
- 📄 **Smart Resume Tailoring**: Contextually tweaks your base resume for every high-matching job to bypass ATS filters, while generating custom cover letters.
- 🎓 **Interview Prep**: Generates personalized, company- and role-specific interview questions based on the job description and your background.
- 📊 **Application Tracking**: A full dashboard to manage incoming matches, application statuses, and daily job digests.
- 🔒 **Secure Auth**: Powered by Supabase.

## Tech Stack

**Frontend Framework**
* Next.js 16.2.6 (React 19.2.4, TypeScript 5)
* App Router architecture

**UI & Styling**
* Tailwind CSS
* Radix UI (accessible, headless component primitives)
* Framer Motion (page transitions and interactive elements)

**State Management & Data Validation**
* Zustand
* Zod

**Backend & Database**
* Next.js API Routes
* Supabase (PostgreSQL + built-in Auth)
* Resend (transactional emails & digests)
* `@react-pdf/renderer` & `pdf-parse`

**AI Orchestration**
* Groq SDK (Llama 3 for ultra-fast reasoning and text generation)
* Anthropic / Claude (supplementary analysis tool)
* Custom internal agent wrappers (Resume, Matching, Interview, Job Fetching)

## Prerequisites

Before installing the project, make sure you have:

- Node.js (v18+)
- An initialized Supabase project
- Active API keys for Groq, Anthropic, and Resend
- Active API keys for Job aggregators (Adzuna)

## Environment Variables

Copy the `.env.example` file (if available) or create a `.env.local` in the root of the project:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

GROQ_API_KEY=your_groq_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

RESEND_API_KEY=your_resend_api_key

# Adzuna (Job fetching)
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_APP_KEY=your_adzuna_app_key
```

## Getting Started

1. **Clone and Install**
   ```bash
   git clone <repository_url>
   cd ai-job-agent
   npm install
   ```

2. **Database Setup**
   Push the schema to your Supabase instance using the SQL dumps located in the `supabase/` folder.

3. **Run the Development Server**
   ```bash
   npm run dev
   ```
   The application will be available at [http://localhost:3000](http://localhost:3000).

## Core API Endpoints

- `POST /api/jobs/fetch`: Pull down new openings from aggregated job sources.
- `POST /api/match`: Run AI scoring on unscored jobs against your parsed resume.
- `POST /api/resume/parse`: Extract text and metadata from PDF uploads.
- `POST /api/resume/tailor`: Dynamically rebuild and optimize a resume against a specific job target.
- `POST /api/apply/smart`: Run end-to-end resume tailoring and cover letter generation instantly.
- `POST /api/interview/generate`: Predict interview questions based on a specific job match.

## License

This project is licensed under the MIT License.
