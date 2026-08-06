import "./load-env.mjs";

import { projectPrivateGrowthReport } from "./lib/growth-portfolio.mjs";
import { configuredProductionSiteOrigin } from "./lib/site-origin.mjs";

const [sourceSlug, periodStart, periodEnd] = process.argv.slice(2);
if (!sourceSlug || !periodStart || !periodEnd) {
  throw new Error("Usage: node scripts/collect-growth-funnel.mjs <source-slug> <period-start> <period-end>");
}

const siteUrl = configuredProductionSiteOrigin(
  process.env.SEO_REPORT_SITE_URL,
  "SEO_REPORT_SITE_URL",
);
const automationToken = process.env.SEO_AUTOMATION_TOKEN;
if (!automationToken || Buffer.byteLength(automationToken, "utf8") < 32) {
  throw new Error("SEO_AUTOMATION_TOKEN must contain at least 32 bytes to collect private attribution data");
}

const endpoint = new URL("/api/attribution/report", siteUrl);
endpoint.searchParams.set("sourceSlug", sourceSlug);
endpoint.searchParams.set("from", periodStart);
endpoint.searchParams.set("to", periodEnd);
const response = await fetch(endpoint, {
  headers: { authorization: `Bearer ${automationToken}` },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) {
  await response.body?.cancel();
  throw new Error(`Private attribution evidence returned HTTP ${response.status}`);
}
const privateReport = await response.json();
const publicReport = projectPrivateGrowthReport(
  privateReport,
  { slug: sourceSlug, path: `/${sourceSlug}` },
  { periodStart, periodEnd },
  siteUrl,
);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 2,
  privacyClass: "public_growth_evidence",
  periodStart,
  periodEnd,
  report: publicReport,
}, null, 2)}\n`);
