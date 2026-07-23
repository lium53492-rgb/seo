import assert from "node:assert/strict";
import test from "node:test";
import {
  attributionStoreStatus,
  readAttributionAggregate,
  recordConversionEvent,
  recordOutboundClick,
} from "../lib/seo/attribution-store.ts";
import { readLandingUv } from "../lib/seo/vercel-analytics.ts";
import {
  normalizeShanghaiReportingPeriod,
  shanghaiReportingWindow,
} from "../lib/seo/reporting-period.ts";

const managedEnv = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "VERCEL_ANALYTICS_TOKEN",
  "VERCEL_TOKEN",
];

function restoreEnvironment(snapshot) {
  for (const key of managedEnv) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

test("reporting periods align UV and conversions to Shanghai calendar days", () => {
  assert.deepEqual(
    normalizeShanghaiReportingPeriod({
      periodStart: "2026-07-22T11:27:00Z",
      periodEnd: "2026-07-23T01:00:00Z",
    }),
    {
      periodStart: "2026-07-21T16:00:00.000Z",
      periodEnd: "2026-07-23T16:00:00.000Z",
    },
  );
  assert.deepEqual(
    shanghaiReportingWindow(30, new Date("2026-07-23T03:00:00Z")),
    {
      periodStart: "2026-06-23T16:00:00.000Z",
      periodEnd: "2026-07-23T16:00:00.000Z",
    },
  );
});

test("attribution storage is explicit, idempotent, and cohort based", async () => {
  const environment = Object.fromEntries(managedEnv.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const key of managedEnv) delete process.env[key];
    assert.equal(attributionStoreStatus().configured, false);
    const unavailable = await recordOutboundClick({
      clickId: "5e9560bf-66ae-42af-b7f6-ea45fdf36cbd",
      keyword: "play an ai roleplay story",
      location: "hero",
      sourceSlug: "play-an-ai-roleplay-story",
      occurredAt: "2026-07-22T10:00:00+08:00",
      qualified: true,
    });
    assert.equal(unavailable.state, "unavailable");

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body || "null")) });
      return Response.json({ result: requests.length === 1 ? 1 : 2 });
    };
    const stored = await recordOutboundClick({
      clickId: "5e9560bf-66ae-42af-b7f6-ea45fdf36cbd",
      keyword: "play an ai roleplay story",
      location: "hero",
      sourceSlug: "play-an-ai-roleplay-story",
      occurredAt: "2026-07-22T10:00:00+08:00",
      qualified: true,
    });
    assert.equal(stored.state, "stored");
    assert.equal(requests[0].body[0], "EVAL");
    assert.match(requests[0].body.join(" "), /cohort:2026-07-22:play-an-ai-roleplay-story/);

    const conversion = await recordConversionEvent({
      schemaVersion: 1,
      eventId: "0f24f6a5-77f7-48d8-aaf8-9ccf3a937cd3",
      clickId: "5e9560bf-66ae-42af-b7f6-ea45fdf36cbd",
      sourceSlug: "play-an-ai-roleplay-story",
      event: "purchase_completed",
      occurredAt: "2026-07-23T10:00:00+08:00",
      revenueMinor: 1299,
      currency: "USD",
    });
    assert.equal(conversion.state, "stored");
    assert.equal(conversion.orphan, true);
    assert.match(requests[1].body.join(" "), /event:conversion:0f24f6a5/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("durable cohorts and Vercel UV expose compatible live inputs", async () => {
  const environment = Object.fromEntries(managedEnv.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    process.env.VERCEL_ANALYTICS_TOKEN = "vercel-token";
    globalThis.fetch = async (url) => {
      const value = String(url);
      if (value.endsWith("/pipeline")) {
        return Response.json([{
          result: [
            "outboundRequests", "7",
            "qualifiedOutboundClicks", "6",
            "trialStarts", "4",
            "signups", "3",
            "paidConversions", "2",
            "purchaseEvents", "2",
            "orphanCallbacks", "0",
            "revenueMinor:USD", "2598",
            "cta:hero", "5",
          ],
        }]);
      }
      assert.match(value, /web-analytics\/visits\/count/);
      assert.equal(
        new URL(value).searchParams.get("filter"),
        "requestPath eq '/play-an-ai-roleplay-story'",
      );
      return Response.json({ data: { visitors: 12, pageviews: 18 } });
    };

    const aggregate = await readAttributionAggregate({
      sourceSlug: "play-an-ai-roleplay-story",
      periodStart: "2026-07-22T00:00:00+08:00",
      periodEnd: "2026-07-22T23:59:59+08:00",
    });
    assert.equal(aggregate.qualifiedOutboundClicks, 6);
    assert.equal(aggregate.revenueByCurrency.USD, 2598);
    assert.equal(aggregate.ctaLocations.hero, 5);

    const uv = await readLandingUv({
      sourceSlug: "play-an-ai-roleplay-story",
      periodStart: "2026-07-22T00:00:00+08:00",
      periodEnd: "2026-07-22T23:59:59+08:00",
    });
    assert.equal(uv.state, "observed");
    assert.equal(uv.visitors, 12);
    assert.equal(uv.pageviews, 18);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});
