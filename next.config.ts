import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingIncludes: {
    "/workbench": ["./data/reports/**/*.json"],
    "/workbench/preview/[slug]": ["./data/reports/**/*.json"],
    "/api/workbench/run": ["./data/reports/**/*.json"],
    "/api/cron/daily-seo": ["./data/reports/**/*.json"],
    "/[slug]": ["./data/pages/**/*.json"],
    "/": ["./data/pages/**/*.json"],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ],
    }];
  },
};

export default nextConfig;
