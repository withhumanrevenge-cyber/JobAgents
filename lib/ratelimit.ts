// In-memory rate limiter (for development)
// For production, replace with @upstash/ratelimit + @vercel/kv

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyPrefix?: string
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(key)
    }
  }
}, 60_000)

export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyPrefix = "rl" } = config

  return {
    async limit(key: string): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
      const fullKey = `${keyPrefix}:${key}`
      const now = Date.now()
      const entry = store.get(fullKey)

      if (!entry || entry.resetTime < now) {
        // New window
        const resetTime = now + windowMs
        store.set(fullKey, { count: 1, resetTime })
        return { success: true, limit: maxRequests, remaining: maxRequests - 1, reset: resetTime }
      }

      if (entry.count >= maxRequests) {
        return { success: false, limit: maxRequests, remaining: 0, reset: entry.resetTime }
      }

      entry.count++
      return { success: true, limit: maxRequests, remaining: maxRequests - entry.count, reset: entry.resetTime }
    },
  }
}

// Pre-configured limiters for different endpoint types
export const aiRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: 10,  // 10 requests per minute
  keyPrefix: "ai",
})

export const authRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: 5,   // 5 requests per minute
  keyPrefix: "auth",
})

export const generalRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: 60,  // 60 requests per minute
  keyPrefix: "general",
})