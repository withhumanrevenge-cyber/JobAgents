import { JobSource } from "@/types"

export interface AtsCompany {
  ats: Extract<JobSource, "greenhouse" | "lever" | "ashby">
  slug: string
}

// Verified live 2026-08-26. Each entry was confirmed to return >0 postings
// from its ATS's public API before landing in this list. Keep it curated —
// dead slugs are silently skipped by the scraper but waste request budget.
export const ATS_COMPANIES: AtsCompany[] = [
  // Greenhouse
  { ats: "greenhouse", slug: "anthropic" },
  { ats: "greenhouse", slug: "stripe" },
  { ats: "greenhouse", slug: "airbnb" },
  { ats: "greenhouse", slug: "dropbox" },
  { ats: "greenhouse", slug: "gitlab" },
  { ats: "greenhouse", slug: "spacex" },
  { ats: "greenhouse", slug: "databricks" },
  { ats: "greenhouse", slug: "mongodb" },
  { ats: "greenhouse", slug: "elastic" },
  { ats: "greenhouse", slug: "cloudflare" },
  { ats: "greenhouse", slug: "rubrik" },
  { ats: "greenhouse", slug: "instacart" },
  { ats: "greenhouse", slug: "robinhood" },
  { ats: "greenhouse", slug: "coinbase" },
  { ats: "greenhouse", slug: "brex" },
  { ats: "greenhouse", slug: "twilio" },
  { ats: "greenhouse", slug: "okta" },
  { ats: "greenhouse", slug: "gusto" },
  { ats: "greenhouse", slug: "discord" },
  { ats: "greenhouse", slug: "affirm" },
  { ats: "greenhouse", slug: "lyft" },
  { ats: "greenhouse", slug: "pinterest" },
  { ats: "greenhouse", slug: "reddit" },
  { ats: "greenhouse", slug: "fastly" },
  { ats: "greenhouse", slug: "asana" },

  // Lever
  { ats: "lever", slug: "palantir" },
  { ats: "lever", slug: "cred" },

  // Ashby (case-sensitive org names)
  { ats: "ashby", slug: "Linear" },
  { ats: "ashby", slug: "Notion" },
  { ats: "ashby", slug: "Ramp" },
  { ats: "ashby", slug: "Perplexity" },
  { ats: "ashby", slug: "Modal" },
  { ats: "ashby", slug: "OpenAI" },
  { ats: "ashby", slug: "ElevenLabs" },
]
