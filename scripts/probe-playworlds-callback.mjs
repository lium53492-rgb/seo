import "./load-env.mjs";

import { randomUUID } from "node:crypto";
import playworldsCallback from "../data/config/playworlds-callback.json" with { type: "json" };
import { createPlayworldsCallbackHeaders } from "../lib/seo/playworlds-callback.ts";
import { configuredProductionSiteOrigin } from "./lib/site-origin.mjs";

const siteUrl = configuredProductionSiteOrigin(
  process.env.SEO_REPORT_SITE_URL,
  "SEO_REPORT_SITE_URL",
);
const secret = process.env.PLAYWORLDS_CALLBACK_SECRET;
if (!secret) {
  throw new Error("PLAYWORLDS_CALLBACK_SECRET is required to probe the Playworlds callback boundary");
}

const occurredAt = new Date();
const probe = {
  schemaVersion: 1,
  probeId: randomUUID(),
  producer: "playworlds",
  product: "playworlds",
  occurredAt: occurredAt.toISOString(),
};
const rawBody = JSON.stringify(probe);
const timestamp = String(Math.floor(occurredAt.getTime() / 1_000));
const response = await fetch(new URL(playworldsCallback.paths.handshake, siteUrl), {
  method: "POST",
  headers: createPlayworldsCallbackHeaders({
    secret,
    timestamp,
    deliveryId: probe.probeId,
    rawBody,
  }),
  body: rawBody,
  cache: "no-store",
  signal: AbortSignal.timeout(15_000),
});
const body = await response.text();
if (!response.ok) {
  throw new Error(
    `Playworlds callback probe returned HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`,
  );
}
const result = JSON.parse(body);
if (
  result.accepted !== true ||
  result.probeId !== probe.probeId ||
  result.producer !== "playworlds" ||
  result.product !== "playworlds"
) {
  throw new Error("Playworlds callback probe returned an invalid acknowledgement");
}
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  provider: "playworlds_callback",
  state: "observed",
  probeId: probe.probeId,
  occurredAt: probe.occurredAt,
  detail: "The LoreLens receiver accepted and durably stored a signed Playworlds handshake.",
}, null, 2)}\n`);
