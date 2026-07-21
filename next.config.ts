import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/workbench": ["./data/reports/**/*.json"],
    "/workbench/preview/[slug]": ["./data/reports/**/*.json"],
    "/api/workbench/run": ["./data/reports/**/*.json"],
    "/api/cron/daily-seo": ["./data/reports/**/*.json"],
    "/[slug]": ["./data/pages/**/*.json"],
    "/": ["./data/pages/**/*.json"],
  },
};

export default nextConfig;
