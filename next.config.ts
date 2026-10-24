import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development"

// On Vercel the Python backend is a service on the same domain (vercel.json routes /api/* to it),
// so NEXT_PUBLIC_API_URL stays unset there. Local dev sets it to the uvicorn server.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).origin : ""

// script-src needs 'unsafe-inline': Next.js streams each page's data to the browser in inline
// <script> tags, and without them React never starts (the page renders blank). Scripts from
// other hosts stay limited to the payment providers. A per-request nonce would avoid
// 'unsafe-inline', but it forces every page to render dynamically.
const csp = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://checkout.razorpay.com https://js.stripe.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: https: blob:;
  connect-src 'self' ${apiOrigin} https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com ${isDev ? "ws://localhost:* http://localhost:*" : ""};
  frame-src 'self' https://checkout.razorpay.com https://js.stripe.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
`.replace(/\s+/g, " ").trim()

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Ensure proper handling of async routes
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
