import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse v2 dynamically loads pdfjs-dist's legacy worker; bundling rewrites that import and breaks getText().
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
