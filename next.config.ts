import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const siteConfig = JSON.parse(
  readFileSync(new URL("./data/config/site.json", import.meta.url), "utf8"),
) as {
  canonicalOrigin: string;
  legacyOrigins: string[];
};

const canonicalOrigin = new URL(siteConfig.canonicalOrigin).origin;
const legacyHosts = siteConfig.legacyOrigins.map((origin) => new URL(origin).host);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingIncludes: {
    "/workbench": [
      "./data/growth/**/*.json",
      "./data/research/**/*.json",
      "./data/reports/**/*.json",
      "./data/reviews/**/*.json",
      "./data/pages/**/*.json",
    ],
    "/workbench/preview/[slug]": ["./data/reports/**/*.json"],
    "/api/workbench/run": [
      "./data/growth/**/*.json",
      "./data/research/**/*.json",
      "./data/reports/**/*.json",
      "./data/reviews/**/*.json",
      "./data/pages/**/*.json",
    ],
    "/api/workbench/feedback": ["./data/seo-feedback/inbox/**/*.json"],
    "/api/cron/daily-seo": ["./data/reports/**/*.json"],
    "/[slug]": ["./data/pages/**/*.json"],
    "/": ["./data/pages/**/*.json"],
  },
  async redirects() {
    return legacyHosts.flatMap((legacyHost) => {
      const legacyHostMatch = [{ type: "host" as const, value: legacyHost }];
      return [
        {
          source: "/",
          has: legacyHostMatch,
          destination: canonicalOrigin,
          permanent: true,
        },
        {
          // Published SEO routes are single-segment slugs. Keeping this match
          // narrow leaves /api/** and /go/** available for compatibility and
          // avoids forwarding authenticated callbacks across product eras.
          source: "/:slug",
          has: legacyHostMatch,
          destination: `${canonicalOrigin}/:slug`,
          permanent: true,
        },
      ];
    });
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
