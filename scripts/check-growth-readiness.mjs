const siteUrl = (process.env.SEO_REPORT_SITE_URL || "https://seo-pi-fawn.vercel.app").replace(/\/$/, "");
const password = process.env.WORKBENCH_PASSWORD;

if (!password) {
  throw new Error("WORKBENCH_PASSWORD is required to check private growth readiness");
}

const endpoint = new URL("/api/attribution/readiness", siteUrl);
const response = await fetch(endpoint, {
  headers: {
    authorization: `Basic ${Buffer.from(`seo:${password}`).toString("base64")}`,
  },
  signal: AbortSignal.timeout(15_000),
});
const body = await response.text();
if (!response.ok) {
  throw new Error(`Growth readiness returned HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
}

const readiness = JSON.parse(body);
process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
if (!readiness.readyFor?.fullLoop) process.exitCode = 2;
