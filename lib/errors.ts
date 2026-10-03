// Error sanitization utility - prevents internal details from leaking to clients

export function sanitizeError(err: unknown, fallback: string = "Internal server error"): string {
  if (err instanceof Error) {
    const message = err.message
    // Check for known safe error patterns
    if (/rate.?limit|429|tokens per day|TPD/i.test(message)) {
      return "Service temporarily unavailable. Please try again shortly."
    }
    if (/quota|insufficient|billing/i.test(message)) {
      return "Service quota exceeded. Please try again later."
    }
    if (/unauthorized|authentication|token/i.test(message)) {
      return "Authentication required."
    }
    if (/not found|404/i.test(message)) {
      return "Resource not found."
    }
    if (/validation|invalid|malformed/i.test(message)) {
      return "Invalid request data."
    }
    // For development, return the actual message
    if (process.env.NODE_ENV === "development") {
      return message
    }
    // In production, return generic message
    return fallback
  }
  return fallback
}

export function createErrorResponse(err: unknown, status: number = 500, fallback?: string) {
  return Response.json(
    { error: sanitizeError(err, fallback) },
    { status }
  )
}

// Async wrapper for API routes with automatic error handling
export async function withErrorHandling<T>(
  handler: () => Promise<T>,
  fallback?: string
): Promise<T | Response> {
  try {
    return await handler()
  } catch (err) {
    console.error("API Error:", err)
    return createErrorResponse(err, 500, fallback)
  }
}