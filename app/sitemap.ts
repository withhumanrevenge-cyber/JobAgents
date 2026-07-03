import type { MetadataRoute } from "next"

const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "")

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/pricing", "/login", "/signup", "/privacy", "/terms"]
  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.6,
  }))
}
