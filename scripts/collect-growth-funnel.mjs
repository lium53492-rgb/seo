import "./load-env.mjs";

const [sourceSlug, periodStart, periodEnd] = process.argv.slice(2);
if (!sourceSlug || !periodStart || !periodEnd) {
  throw new Error("Usage: node scripts/collect-growth-funnel.mjs <source-slug> <period-start> <period-end>");
}

const siteUrl = (process.env.SEO_REPORT_SITE_URL || "https://seo-pi-fawn.vercel.app").replace(/\/$/, "");
const password = process.env.WORKBENCH_PASSWORD;
if (!password) throw new Error("WORKBENCH_PASSWORD is required to collect private attribution data");

const endpoint = new URL("/api/attribution/report", siteUrl);
endpoint.searchParams.set("sourceSlug", sourceSlug);
endpoint.searchParams.set("from", periodStart);
endpoint.searchParams.set("to", periodEnd);
const authorization = Buffer.from(`seo:${password}`).toString("base64");
const response = await fetch(endpoint, {
  headers: { authorization: `Basic ${authorization}` },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) {
  throw new Error(`Attribution report returned ${response.status}: ${await response.text()}`);
}
process.stdout.write(`${JSON.stringify(await response.json(), null, 2)}\n`);
