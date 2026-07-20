import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/workbench": ["./data/reports/**/*.json"],
    "/workbench/preview/[slug]": ["./data/reports/**/*.json"],
    "/[slug]": ["./data/pages/**/*.json"],
    "/": ["./data/pages/**/*.json"],
  },
};

export default nextConfig;
