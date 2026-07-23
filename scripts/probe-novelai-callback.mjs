import "./load-env.mjs";

import { randomUUID } from "node:crypto";

const siteUrl = (
  process.env.SEO_REPORT_SITE_URL || "https://seo-pi-fawn.vercel.app"
).replace(/\/$/, "");
const secret = process.env.ATTRIBUTION_SECRET;

if (!secret) {
  throw new Error("ATTRIBUTION_SECRET is required to probe the NovelAI callback boundary");
}

const probe = {
  schemaVersion: 1,
  probeId: randomUUID(),
  producer: "novelai",
  occurredAt: new Date().toISOString(),
};
const response = await fetch(new URL("/api/attribution/probe", siteUrl), {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(probe),
  signal: AbortSignal.timeout(15_000),
});
const body = await response.text();
if (!response.ok) {
  throw new Error(
    `NovelAI callback probe returned HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`,
  );
}
const result = JSON.parse(body);
if (result.accepted !== true || result.probeId !== probe.probeId) {
  throw new Error("NovelAI callback probe returned an invalid acknowledgement");
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
