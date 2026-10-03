import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { aiRateLimiter, authRateLimiter, generalRateLimiter } from "@/lib/ratelimit"

export async function middleware(request: NextRequest) {
  // Apply Supabase auth middleware first
  const supabaseResponse = await updateSession(request)

  // Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               request.headers.get("x-real-ip") ||
               "unknown"

    let limiter
    const path = request.nextUrl.pathname

    // AI endpoints - strict rate limiting
    if (
      path === "/api/apply/smart" ||
      path === "/api/interview/generate" ||
      path === "/api/resume/tailor" ||
      path === "/api/match" ||
      path === "/api/jobs/fetch"
    ) {
      limiter = aiRateLimiter
    }
    // Auth endpoints
    else if (path.startsWith("/api/auth/")) {
      limiter = authRateLimiter
    }
    // General API endpoints
    else {
      limiter = generalRateLimiter
    }

    const { success, limit, remaining, reset } = await limiter.limit(ip)

    // Add rate limit headers
    supabaseResponse.headers.set("X-RateLimit-Limit", limit.toString())
    supabaseResponse.headers.set("X-RateLimit-Remaining", remaining.toString())
    supabaseResponse.headers.set("X-RateLimit-Reset", Math.ceil(reset / 1000).toString())

    if (!success) {
      return new NextResponse(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil(reset / 1000).toString(),
            "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        }
      )
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}