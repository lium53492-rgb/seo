import "./load-env.mjs";

const siteUrl = (process.env.SEO_REPORT_SITE_URL || "https://seo-pi-fawn.vercel.app").replace(/\/$/, "");
const automationToken = process.env.SEO_AUTOMATION_TOKEN;

if (!automationToken || Buffer.byteLength(automationToken, "utf8") < 32) {
  throw new Error("SEO_AUTOMATION_TOKEN must contain at least 32 bytes to check private growth readiness");
}

const endpoint = new URL("/api/attribution/readiness", siteUrl);
const response = await fetch(endpoint, {
  headers: {
    authorization: `Bearer ${automationToken}`,
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
