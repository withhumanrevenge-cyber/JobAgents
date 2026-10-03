// Startup validation - run once at app initialization
// Add this to your app/layout.tsx or a dedicated initialization route

let _validated = false

export function validateEnvironment(): { valid: boolean; errors: string[] } {
  if (_validated) return { valid: true, errors: [] }

  const errors: string[] = []
  const warnings: string[] = []

  // Required for production
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GROQ_API_KEY",
    "CRON_SECRET",
  ]

  // Required for payments
  const paymentRequired = [
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "RAZORPAY_PRO_PLAN_ID",
    "RAZORPAY_PREMIUM_PLAN_ID",
    "LEMONSQUEEZY_API_KEY",
    "LEMONSQUEEZY_STORE_ID",
    "LEMONSQUEEZY_PRO_VARIANT_ID",
    "LEMONSQUEEZY_PREMIUM_VARIANT_ID",
    "LEMONSQUEEZY_WEBHOOK_SECRET",
  ]

  // Required for email
  const emailRequired = [
    "RESEND_API_KEY",
    "RESEND_FROM",
  ]

  // Required for job fetching
  const jobRequired = [
    "ADZUNA_APP_ID",
    "ADZUNA_APP_KEY",
  ]

  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`)
    }
  }

  // In production, payments and email are required
  if (process.env.NODE_ENV === "production") {
    for (const key of [...paymentRequired, ...emailRequired, ...jobRequired]) {
      if (!process.env[key] || process.env[key].includes("your-")) {
        errors.push(`Missing required production environment variable: ${key}`)
      }
    }
  } else {
    // In dev, warn about missing optional vars
    for (const key of [...paymentRequired, ...emailRequired, ...jobRequired]) {
      if (!process.env[key] || process.env[key].includes("your-")) {
        warnings.push(`Optional environment variable not set: ${key}`)
      }
    }
  }

  // Validate URL formats
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith("https://")) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS URL")
  }

  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.startsWith("http")) {
    errors.push("NEXT_PUBLIC_APP_URL must be a valid URL")
  }

  _validated = true

  if (warnings.length > 0) {
    console.warn("Environment warnings:", warnings.join(", "))
  }

  return { valid: errors.length === 0, errors }
}

// Call this in your app/layout.tsx or middleware
export function assertEnvironment() {
  const { valid, errors } = validateEnvironment()
  if (!valid) {
    const message = `Environment validation failed:\n${errors.join("\n")}`
    console.error(message)
    if (process.env.NODE_ENV === "production") {
      throw new Error(message)
    }
  }
}