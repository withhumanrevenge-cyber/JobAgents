import type { MetadataRoute } from "next"

const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "")

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/jobs", "/applications", "/settings", "/admin", "/onboarding", "/hire", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
