// The 18 countries Adzuna's free tier supports as separate endpoints.
// JSearch accepts the same ISO codes via its `country` query param.
// Codes are uppercase ISO-3166-1 alpha-2; lowercased on the Adzuna URL.
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "IN", name: "India" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "SG", name: "Singapore" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "NZ", name: "New Zealand" },
  { code: "PL", name: "Poland" },
  { code: "ZA", name: "South Africa" },
  { code: "CH", name: "Switzerland" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
]

export const COUNTRY_NAME: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]))

export const DEFAULT_COUNTRY = "US"

// Subset Adzuna actually supports as separate URL endpoints.
export const ADZUNA_SUPPORTED = new Set(COUNTRIES.map((c) => c.code))
