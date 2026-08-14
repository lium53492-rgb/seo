import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import test from "node:test";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const emptyServerOnlyModule = "data:text/javascript,export {}";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: emptyServerOnlyModule, shortCircuit: true };
    }
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if (specifier.startsWith("@/")) {
      const aliasedPath = specifier.slice(2);
      const path = join(
        projectRoot,
        aliasedPath.endsWith(".json") ? aliasedPath : `${aliasedPath}.ts`,
      );
      return {
        url: pathToFileURL(path).href,
        ...(aliasedPath.endsWith(".json")
          ? { importAttributes: { type: "json" } }
          : {}),
        shortCircuit: true,
      };
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:") &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      const candidate = fileURLToPath(new URL(`${specifier}.ts`, context.parentURL));
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const { NextRequest } = await import("next/server.js");
const {
  firstPartyLandingAnalyticsStatus,
  readFirstPartyLandingAnalytics,
  recordLandingCoverageCheckpoint,
  recordLandingView,
} = await import("../lib/seo/attribution-store.ts");
const { readLandingAnalytics } = await import("../lib/seo/landing-analytics.ts");
const landingRoute = await import("../app/api/analytics/landing-view/route.ts");
const coverageRoute = await import("../app/api/cron/landing-analytics/[phase]/route.ts");

const managedEnv = [
  "NODE_ENV",
  "VERCEL_ENV",
  "NEXT_PUBLIC_SITE_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "VERCEL_ANALYTICS_TOKEN",
  "VERCEL_TOKEN",
  "FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT",
  "CRON_SECRET",
];

function snapshotEnvironment() {
  return Object.fromEntries(managedEnv.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function configureFirstParty(startedAt = "2026-08-10T00:00:00.000Z") {
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT = startedAt;
  delete process.env.VERCEL_ANALYTICS_TOKEN;
  delete process.env.VERCEL_TOKEN;
}

test("first-party landing analytics requires an explicit coverage watermark", () => {
  const environment = snapshotEnvironment();
  try {
    for (const key of managedEnv) delete process.env[key];
    assert.equal(firstPartyLandingAnalyticsStatus().configured, false);
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    assert.match(firstPartyLandingAnalyticsStatus().detail, /STARTED_AT/);

    configureFirstParty();
    assert.deepEqual(firstPartyLandingAnalyticsStatus(), {
      configured: true,
      provider: "first_party_upstash",
      startedAt: "2026-08-10T00:00:00.000Z",
      firstCompleteShanghaiDayStart: "2026-08-10T16:00:00.000Z",
    });
    configureFirstParty("2026-08-10T16:00:00.000Z");
    assert.equal(
      firstPartyLandingAnalyticsStatus().firstCompleteShanghaiDayStart,
      "2026-08-10T16:00:00.000Z",
    );
  } finally {
    restoreEnvironment(environment);
  }
});

test("landing writes are idempotent, bounded, and never persist the raw visitor cookie", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    configureFirstParty();
    const commands = [];
    const results = [1, 0];
    globalThis.fetch = async (_url, init) => {
      const command = JSON.parse(String(init?.body));
      commands.push(command);
      return Response.json({ result: results.shift() });
    };
    const input = {
      sourceSlug: "ai-roleplay-prompt-vs-existing-story",
      visitorId: "6d83f7f0-c2e7-4b1e-8b13-3f99e07fcaae",
      viewId: "ca5ddcb2-3450-4fcb-a446-2744cdba17b0",
      rateLimitIdentity: "203.0.113.10",
      occurredAt: "2026-08-11T10:00:00.000Z",
    };
    assert.equal((await recordLandingView(input)).state, "stored");
    assert.equal((await recordLandingView(input)).state, "duplicate");
    assert.equal(commands[0][0], "EVAL");
    assert.equal(commands[0][2], 4);
    assert.match(commands[0][3], /landing:event:\{ai-roleplay-prompt-vs-existing-story\}/);
    assert.match(commands[0][4], /landing:day:\{ai-roleplay-prompt-vs-existing-story\}:2026-08-11/);
    assert.match(commands[0][5], /landing:hll:\{ai-roleplay-prompt-vs-existing-story\}:2026-08-11/);
    assert.match(commands[0][6], /landing:rate:\{ai-roleplay-prompt-vs-existing-story\}:[a-f0-9]{64}:/);
    assert.match(commands[0][7], /^[a-f0-9]{64}$/);
    assert.doesNotMatch(commands[0].join(" "), new RegExp(input.visitorId, "i"));
    assert.doesNotMatch(commands[0].join(" "), new RegExp(input.rateLimitIdentity, "i"));
    assert.equal(commands[0][8], 8 * 24 * 60 * 60);
    assert.equal(commands[0][9], 400 * 24 * 60 * 60);
    assert.equal(commands[0][10], 120);
    assert.equal(commands[0][11], 60);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("first-party reporting rejects pre-coverage windows and unions multi-day HLL keys", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    configureFirstParty();
    let fetchCalls = 0;
    const unavailable = await readFirstPartyLandingAnalytics({
      sourceSlug: "ai-roleplay-prompt-vs-existing-story",
      periodStart: "2026-08-09T16:00:00.000Z",
      periodEnd: "2026-08-10T16:00:00.000Z",
    });
    assert.equal(unavailable.state, "unavailable");
    assert.match(unavailable.detail, /before complete first-party coverage/);

    let pipeline;
    globalThis.fetch = async (url, init) => {
      fetchCalls += 1;
      assert.match(String(url), /\/pipeline$/);
      pipeline = JSON.parse(String(init?.body));
      return Response.json([
        { result: 1 },
        { result: "2" },
        { result: "3" },
        {
          result: [
            "startAt", "2026-08-10T16:05:00.000Z",
            "endAt", "2026-08-11T15:55:00.000Z",
          ],
        },
        {
          result: [
            "startAt", "2026-08-11T16:05:00.000Z",
            "endAt", "2026-08-12T15:55:00.000Z",
          ],
        },
      ]);
    };
    const observed = await readLandingAnalytics({
      sourceSlug: "ai-roleplay-prompt-vs-existing-story",
      periodStart: "2026-08-10T16:00:00.000Z",
      periodEnd: "2026-08-12T16:00:00.000Z",
    });
    assert.equal(fetchCalls, 1);
    assert.equal(observed.state, "observed");
    assert.equal(observed.source, "first_party_analytics");
    assert.equal(observed.visitors, 1);
    assert.equal(observed.pageviews, 5);
    assert.deepEqual(pipeline[0].slice(0, 1), ["PFCOUNT"]);
    assert.equal(pipeline[0].length, 3);
    assert.equal(pipeline.length, 5);
    assert.match(pipeline[0][1], /\{ai-roleplay-prompt-vs-existing-story\}:2026-08-11$/);
    assert.match(pipeline[0][2], /\{ai-roleplay-prompt-vs-existing-story\}:2026-08-12$/);
    assert.match(observed.detail, /HyperLogLog estimate/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("zero UV needs daily coverage proof and never falls through to Vercel", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    configureFirstParty();
    process.env.VERCEL_ANALYTICS_TOKEN = "fallback-token";
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls += 1;
      assert.match(String(url), /\/pipeline$/);
      return Response.json([
        { result: 0 },
        { result: null },
        {
          result: [
            "startAt", "2026-08-10T16:05:00.000Z",
            "endAt", "2026-08-11T15:55:00.000Z",
          ],
        },
      ]);
    };
    const observed = await readLandingAnalytics({
      sourceSlug: "ai-roleplay-prompt-vs-existing-story",
      periodStart: "2026-08-10T16:00:00.000Z",
      periodEnd: "2026-08-11T16:00:00.000Z",
    });
    assert.equal(calls, 1);
    assert.deepEqual(
      { state: observed.state, source: observed.source, visitors: observed.visitors, pageviews: observed.pageviews },
      { state: "observed", source: "first_party_analytics", visitors: 0, pageviews: 0 },
    );

    globalThis.fetch = async () => Response.json([
      { result: 0 },
      { result: null },
      { result: null },
    ]);
    const missingCoverage = await readFirstPartyLandingAnalytics({
      sourceSlug: "ai-roleplay-prompt-vs-existing-story",
      periodStart: "2026-08-10T16:00:00.000Z",
      periodEnd: "2026-08-11T16:00:00.000Z",
    });
    assert.equal(missingCoverage.state, "unavailable");
    assert.match(missingCoverage.detail, /no complete start\/end coverage proof/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("pre-coverage and provider failures use a complete-period fallback without merging", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    configureFirstParty("2026-08-12T00:00:00.000Z");
    process.env.VERCEL_ANALYTICS_TOKEN = "fallback-token";
    let requestedUrl = "";
    globalThis.fetch = async (url) => {
      requestedUrl = String(url);
      return Response.json({ data: { visitors: 7, pageviews: 9 } });
    };
    const fallback = await readLandingAnalytics({
      sourceSlug: "ai-roleplay-prompt-vs-existing-story",
      periodStart: "2026-08-10T16:00:00.000Z",
      periodEnd: "2026-08-11T16:00:00.000Z",
    });
    assert.equal(fallback.source, "vercel_analytics");
    assert.equal(fallback.visitors, 7);
    assert.match(requestedUrl, /api\.vercel\.com/);

    configureFirstParty();
    process.env.VERCEL_ANALYTICS_TOKEN = "fallback-token";
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls += 1;
      if (String(url).endsWith("/pipeline")) throw new Error("redis unavailable");
      return new Response("not-json", { status: 200 });
    };
    const unavailable = await readLandingAnalytics({
      sourceSlug: "ai-roleplay-prompt-vs-existing-story",
      periodStart: "2026-08-10T16:00:00.000Z",
      periodEnd: "2026-08-11T16:00:00.000Z",
    });
    assert.equal(calls, 2);
    assert.equal(unavailable.state, "unavailable");
    assert.equal(unavailable.source, "first_party_analytics");
    assert.match(unavailable.detail, /First-party.*Vercel/s);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("coverage checkpoints are authenticated and bind end checks to the closing Shanghai day", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    configureFirstParty();
    const commands = [];
    globalThis.fetch = async (_url, init) => {
      commands.push(JSON.parse(String(init?.body)));
      return Response.json({ result: 1 });
    };
    const end = await recordLandingCoverageCheckpoint({
      phase: "end",
      occurredAt: "2026-08-12T16:20:00.000Z",
    });
    assert.equal(end.day, "2026-08-12");
    assert.match(commands[0][3], /landing:coverage:2026-08-12$/);

    process.env.CRON_SECRET = "coverage-secret-with-at-least-16-characters";
    const unauthorized = await coverageRoute.GET(
      new Request("https://lorelens.novelai.ai/api/cron/landing-analytics/start"),
      { params: Promise.resolve({ phase: "start" }) },
    );
    assert.equal(unauthorized.status, 401);
    const authorized = await coverageRoute.GET(
      new Request("https://lorelens.novelai.ai/api/cron/landing-analytics/start", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
      { params: Promise.resolve({ phase: "start" }) },
    );
    assert.equal(authorized.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("public landing endpoint enforces page context, privacy preferences, and secure cookies", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  const origin = "https://lorelens.novelai.ai";
  const slug = "ai-roleplay-prompt-vs-existing-story";
  const viewId = "ca5ddcb2-3450-4fcb-a446-2744cdba17b0";
  try {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = `${origin}/`;
    configureFirstParty("2026-08-10T00:00:00.000Z");
    let writes = 0;
    globalThis.fetch = async () => {
      writes += 1;
      return Response.json({ result: writes === 1 ? 1 : 0 });
    };
    const request = (headers = {}) => new NextRequest(
      `${origin}/api/analytics/landing-view`,
      {
        method: "POST",
        headers: {
          origin,
          referer: `${origin}/${slug}?from=search`,
          "sec-fetch-site": "same-origin",
          "sec-fetch-dest": "empty",
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Chrome/140.0",
          "x-forwarded-for": "203.0.113.10",
          ...headers,
        },
        body: JSON.stringify({ sourceSlug: slug, viewId }),
      },
    );

    const first = await landingRoute.POST(request());
    assert.equal(first.status, 204);
    assert.equal(writes, 1);
    const cookie = first.headers.get("set-cookie");
    assert.match(cookie, /__Host-lorelens_vid=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//i);

    const cookieValue = cookie.match(/__Host-lorelens_vid=([^;]+)/)[1];
    const duplicate = await landingRoute.POST(request({
      cookie: `__Host-lorelens_vid=${cookieValue}`,
    }));
    assert.equal(duplicate.status, 204);
    assert.equal(writes, 2);
    assert.equal(duplicate.headers.get("set-cookie"), null);

    const crossOrigin = await landingRoute.POST(request({ origin: "https://evil.example" }));
    assert.equal(crossOrigin.status, 403);
    assert.equal(writes, 2);

    const privacy = await landingRoute.POST(request({ "sec-gpc": "1" }));
    assert.equal(privacy.status, 204);
    assert.equal(privacy.headers.get("set-cookie"), null);
    assert.equal(writes, 2);

    globalThis.fetch = async () => {
      writes += 1;
      return Response.json({ result: -1 });
    };
    const limited = await landingRoute.POST(request({
      "x-forwarded-for": "203.0.113.11",
    }));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.equal(limited.headers.get("set-cookie"), null);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("public landing endpoint rejects malformed, cross-context, and retired-page traffic before Redis", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  const origin = "https://lorelens.novelai.ai";
  const slug = "ai-roleplay-prompt-vs-existing-story";
  const viewId = "ca5ddcb2-3450-4fcb-a446-2744cdba17b0";
  try {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = `${origin}/`;
    configureFirstParty();
    globalThis.fetch = async () => {
      throw new Error("Rejected requests must not reach Redis");
    };
    const request = ({
      sourceSlug = slug,
      body = { sourceSlug, viewId },
      headers = {},
    } = {}) => new NextRequest(`${origin}/api/analytics/landing-view`, {
      method: "POST",
      headers: {
        origin,
        referer: `${origin}/${sourceSlug}`,
        "sec-fetch-site": "same-origin",
        "sec-fetch-dest": "empty",
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 Chrome/140.0",
        "x-forwarded-for": "203.0.113.10",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

    assert.equal((await landingRoute.POST(request({ headers: { origin: "" } }))).status, 403);
    assert.equal((await landingRoute.POST(request({ headers: { "sec-fetch-site": "cross-site" } }))).status, 403);
    assert.equal((await landingRoute.POST(request({ headers: { "sec-fetch-dest": "document" } }))).status, 403);
    assert.equal((await landingRoute.POST(request({ headers: { referer: `${origin}/wrong-page` } }))).status, 403);
    assert.equal((await landingRoute.POST(request({ headers: { "content-type": "text/plain" } }))).status, 415);
    assert.equal((await landingRoute.POST(request({ body: { sourceSlug: slug, viewId: "not-a-uuid" } }))).status, 400);
    assert.equal((await landingRoute.POST(request({
      body: JSON.stringify({ sourceSlug: "x".repeat(600), viewId }),
    }))).status, 413);
    const retiredSlug = "ai-roleplay-scene-recovery";
    assert.equal((await landingRoute.POST(request({ sourceSlug: retiredSlug }))).status, 404);
    const dnt = await landingRoute.POST(request({ headers: { dnt: "1" } }));
    assert.equal(dnt.status, 204);
    assert.equal(dnt.headers.get("set-cookie"), null);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("the public dynamic route owns the beacon and workbench previews do not", async () => {
  const publicRoute = await readFile(join(projectRoot, "app/[slug]/page.tsx"), "utf8");
  const previewRoute = await readFile(
    join(projectRoot, "app/workbench/preview/[slug]/page.tsx"),
    "utf8",
  );
  assert.match(publicRoute, /<LandingViewBeacon sourceSlug=\{page\.slug\} \/>/);
  assert.doesNotMatch(previewRoute, /LandingViewBeacon/);
});
