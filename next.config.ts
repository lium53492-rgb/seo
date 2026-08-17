import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { withMicrofrontends } from "@vercel/microfrontends/next/config";
import siteConfig from "./data/config/site.json" with { type: "json" };

const canonicalOrigin = new URL(siteConfig.canonicalOrigin).origin;
const canonicalBasePath = siteConfig.canonicalBasePath;
const canonicalBaseUrl = `${canonicalOrigin}${canonicalBasePath}`;
const publicAssetBasePath = siteConfig.assetBasePath;
const legacyHosts = siteConfig.legacyOrigins.map((origin) => new URL(origin).host);
const privateServiceHosts = [
  siteConfig.privateServiceOrigin,
  ...siteConfig.privateServiceAliases,
].map((origin) => new URL(origin).host);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  // Keep content and assets in separate namespaces. Vercel Microfrontends
  // requires this unique prefix to be routed to the child alongside /guides.
  // This is not Next's unsupported `basePath` option.
  assetPrefix: publicAssetBasePath,
  images: {
    path: `${publicAssetBasePath}/_next/image`,
  },
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
    "/guides/[slug]": ["./data/pages/**/*.json"],
    "/guides": ["./data/pages/**/*.json"],
    "/": ["./data/pages/**/*.json"],
  },
  async redirects() {
    const publicRedirects = legacyHosts.flatMap((legacyHost) => {
      const legacyHostMatch = [{ type: "host" as const, value: legacyHost }];
      return [
        {
          source: "/",
          has: legacyHostMatch,
          destination: canonicalBaseUrl,
          permanent: true,
        },
        {
          source: canonicalBasePath,
          has: legacyHostMatch,
          destination: canonicalBaseUrl,
          permanent: true,
        },
        {
          source: `${canonicalBasePath}/:path*`,
          has: legacyHostMatch,
          destination: `${canonicalBaseUrl}/:path*`,
          permanent: true,
        },
        {
          // Published SEO routes are single-segment slugs. Keeping this match
          // narrow leaves /api/** and /go/** available for compatibility and
          // avoids forwarding authenticated callbacks across product eras.
          source: "/:slug",
          has: legacyHostMatch,
          destination: `${canonicalBaseUrl}/:slug`,
          permanent: true,
        },
      ];
    });
    const privateHostRedirects = privateServiceHosts.flatMap((privateHost) => {
      const privateHostMatch = [{ type: "host" as const, value: privateHost }];
      return [
        {
          source: "/",
          has: privateHostMatch,
          destination: canonicalBaseUrl,
          permanent: true,
        },
        {
          source: canonicalBasePath,
          has: privateHostMatch,
          destination: canonicalBaseUrl,
          permanent: true,
        },
        {
          source: `${canonicalBasePath}/:path*`,
          has: privateHostMatch,
          destination: `${canonicalBaseUrl}/:path*`,
          permanent: true,
        },
        {
          source: "/:slug((?!api|go|guides|workbench)[a-z0-9]+(?:-[a-z0-9]+)*)",
          has: privateHostMatch,
          destination: `${canonicalBaseUrl}/:slug`,
          permanent: true,
        },
      ];
    });
    return [...publicRedirects, ...privateHostRedirects];
  },
  async rewrites() {
    return [
      {
        source: `${publicAssetBasePath}/_next/:path*`,
        destination: "/_next/:path*",
      },
      ...["characters", "cursors", "images", "story-scenes"].map((directory) => ({
        source: `${publicAssetBasePath}/${directory}/:path*`,
        destination: `/${directory}/:path*`,
      })),
    ];
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

const hasMicrofrontendsConfig = process.env.VERCEL === "1"
  || Boolean(process.env.VC_MICROFRONTENDS_CONFIG)
  || Boolean(process.env.VC_MICROFRONTENDS_CONFIG_FILE_NAME)
  || existsSync("microfrontends.json")
  || existsSync("microfrontends.jsonc");

// Vercel/group builds must fail closed when their shared routing config is
// missing. Plain child-only tests can still inspect this config before the
// default application's repository and deployable microfrontends.json exist.
export default hasMicrofrontendsConfig
  ? withMicrofrontends(nextConfig)
  : nextConfig;
