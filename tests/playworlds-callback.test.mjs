import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

const {
  createPlayworldsCallbackHeaders,
  createPlayworldsCallbackSignature,
  evaluatePlayworldsAttributionJoin,
  evaluatePlayworldsFullLoopReadiness,
  playworldsCallbackReceiverStatus,
  readBoundedPlayworldsCallbackBody,
  verifyPlayworldsCallbackSignature,
} = await import("../lib/seo/playworlds-callback.ts");
const {
  readPlayworldsCallbackHealth,
  readPlayworldsIntegrationProbe,
  recordPlayworldsConversionEvent,
  recordPlayworldsIntegrationProbe,
} = await import("../lib/seo/attribution-store.ts");
const conversionRoute = await import("../app/api/attribution/playworlds/conversion/route.ts");
const handshakeRoute = await import("../app/api/attribution/playworlds/handshake/route.ts");
const readinessRoute = await import("../app/api/attribution/readiness/route.ts");

const secret = "playworlds-callback-test-secret-32-bytes-minimum";
const eventId = "0f24f6a5-77f7-48d8-aaf8-9ccf3a937cd3";
const clickId = "5e9560bf-66ae-42af-b7f6-ea45fdf36cbd";

const managedEnvironment = [
  "PLAYWORLDS_CALLBACK_SECRET",
  "SEO_AUTOMATION_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL",
  "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY",
  "GOOGLE_SEARCH_CONSOLE_SITE_URL",
  "VERCEL_ANALYTICS_TOKEN",
  "VERCEL_TOKEN",
  "VERCEL_ANALYTICS_PROJECT_ID",
  "VERCEL_ANALYTICS_TEAM_ID",
  "FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT",
];

function snapshotEnvironment() {
  return Object.fromEntries(managedEnvironment.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(snapshot) {
  for (const key of managedEnvironment) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function signedRequest(url, body, deliveryId, now = new Date()) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(now.getTime() / 1_000));
  return new Request(url, {
    method: "POST",
    headers: createPlayworldsCallbackHeaders({
      secret,
      timestamp,
      deliveryId,
      rawBody,
    }),
    body: rawBody,
  });
}

test("Playworlds callback HMAC binds the timestamp, delivery ID, and exact raw body", () => {
  const rawBody = JSON.stringify({ schemaVersion: 1, value: "signed" });
  const timestamp = "1787047200";
  const headers = new Headers(createPlayworldsCallbackHeaders({
    secret,
    timestamp,
    deliveryId: eventId,
    rawBody,
  }));
  const valid = verifyPlayworldsCallbackSignature({
    headers,
    rawBody,
    secret,
    nowMs: Number(timestamp) * 1_000,
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.deliveryId, eventId);

  for (const mutation of [
    { headers, rawBody: `${rawBody} ` },
    {
      headers: new Headers({ ...Object.fromEntries(headers), "x-playworlds-delivery-id": clickId }),
      rawBody,
    },
    {
      headers: new Headers({ ...Object.fromEntries(headers), "x-playworlds-timestamp": "1787047201" }),
      rawBody,
    },
  ]) {
    const rejected = verifyPlayworldsCallbackSignature({
      ...mutation,
      secret,
      nowMs: Number(timestamp) * 1_000,
    });
    assert.deepEqual(rejected, {
      ok: false,
      status: 401,
      error: "Invalid Playworlds callback signature",
    });
  }

  const stale = verifyPlayworldsCallbackSignature({
    headers,
    rawBody,
    secret,
    nowMs: Number(timestamp) * 1_000 + 301_000,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 401);
  assert.throws(() => createPlayworldsCallbackSignature({
    secret: "too-short",
    timestamp,
    deliveryId: eventId,
    rawBody,
  }), /at least 32 bytes/);
  assert.equal(playworldsCallbackReceiverStatus("too-short").configured, false);
});

test("Playworlds callback body reader stops oversized streamed bodies", async () => {
  const result = await readBoundedPlayworldsCallbackBody(new Request(
    "http://localhost/api/attribution/playworlds/handshake",
    { method: "POST", body: "x".repeat(16_385), duplex: "half" },
  ));
  assert.deepEqual(result, { ok: false, status: 413, error: "Payload too large" });
});

test("Playworlds storage uses product-specific conversion and handshake namespaces", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    const probe = {
      schemaVersion: 1,
      probeId: eventId.toUpperCase(),
      producer: "playworlds",
      product: "playworlds",
      occurredAt: "2026-08-18T10:00:00.000Z",
    };
    const commands = [];
    let storedProbePayload = null;
    globalThis.fetch = async (_url, init) => {
      const command = JSON.parse(String(init?.body));
      commands.push(command);
      if (command[0] === "EVAL") return Response.json({ result: 1 });
      if (command[0] === "SET") {
        storedProbePayload = command[2];
        return Response.json({ result: "OK" });
      }
      return Response.json({ result: storedProbePayload });
    };

    const conversion = await recordPlayworldsConversionEvent({
      schemaVersion: 1,
      producer: "playworlds",
      product: "playworlds",
      eventId: eventId.toUpperCase(),
      clickId: clickId.toUpperCase(),
      sourceSlug: "story-driven-ai-voice-roleplay-adventure",
      event: "trial_started",
      occurredAt: "2026-08-18T10:05:00.000Z",
    });
    const storedProbe = await recordPlayworldsIntegrationProbe(probe);
    const observedProbe = await readPlayworldsIntegrationProbe();

    assert.equal(conversion.state, "stored");
    assert.equal(storedProbe.state, "stored");
    assert.equal(observedProbe.state, "observed");
    assert.equal(observedProbe.probeId, eventId);
    assert.match(commands[0].join(" "), /event:conversion:playworlds:/);
    assert.match(commands[0][1], /existingEvent == ARGV\[1\]/);
    assert.match(commands[0][1], /product ~= "playworlds"/);
    assert.match(commands[0][3], new RegExp(`${eventId}$`));
    assert.match(commands[0][4], new RegExp(`${clickId}$`));
    assert.match(commands[0].join(" "), /cohort: playworlds/);
    assert.match(commands[1].join(" "), /integration:playworlds/);
    assert.doesNotMatch(commands[1].join(" "), /cohort:/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("signed handshake becomes recent readiness without fabricating a conversion", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    for (const key of managedEnvironment) delete process.env[key];
    process.env.PLAYWORLDS_CALLBACK_SECRET = secret;
    process.env.SEO_AUTOMATION_TOKEN = "machine-readiness-token-with-at-least-32-bytes";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    const occurredAt = new Date();
    const probe = {
      schemaVersion: 1,
      probeId: eventId,
      producer: "playworlds",
      product: "playworlds",
      occurredAt: occurredAt.toISOString(),
    };
    const commands = [];
    let orphanCallbacks = 0;
    globalThis.fetch = async (_url, init) => {
      const command = JSON.parse(String(init?.body));
      commands.push(command);
      if (command[0] === "HGETALL") {
        return Response.json({
          result: [
            "acceptedCallbacks", String(orphanCallbacks),
            "orphanCallbacks", String(orphanCallbacks),
          ],
        });
      }
      return Response.json({
        result: command[0] === "SET" ? "OK" : JSON.stringify(probe),
      });
    };

    const response = await handshakeRoute.POST(signedRequest(
      "http://localhost/api/attribution/playworlds/handshake",
      probe,
      probe.probeId,
      occurredAt,
    ));
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      accepted: true,
      probeId: probe.probeId,
      producer: "playworlds",
      product: "playworlds",
      detail: "Playworlds callback handshake stored without changing funnel metrics.",
    });

    const readiness = await readinessRoute.GET(new Request(
      "http://localhost/api/attribution/readiness",
      { headers: { authorization: `Bearer ${process.env.SEO_AUTOMATION_TOKEN}` } },
    ));
    assert.equal(readiness.status, 200);
    const body = await readiness.json();
    assert.equal(body.sources.conversionCallback.configured, true);
    assert.equal(body.sources.conversionCallback.handshake.state, "observed");
    assert.equal(body.sources.conversionCallback.handshake.recent, true);
    assert.equal(body.readyFor.outboundToRevenue, true);
    assert.equal(body.readyFor.fullLoop, false, "a handshake alone is not a full search-to-revenue loop");
    assert.deepEqual(commands.map((command) => command[0]), ["SET", "GET", "HGETALL"]);
    assert.ok(commands.every((command) => !command.join(" ").includes("cohort:")));

    orphanCallbacks = 1;
    const blockedReadiness = await readinessRoute.GET(new Request(
      "http://localhost/api/attribution/readiness",
      { headers: { authorization: `Bearer ${process.env.SEO_AUTOMATION_TOKEN}` } },
    ));
    const blockedBody = await blockedReadiness.json();
    assert.equal(blockedBody.attributionJoin.blocked, true);
    assert.equal(blockedBody.attributionJoin.orphanCallbacks, 1);
    assert.equal(blockedBody.readyFor.outboundToRevenue, false);
    assert.equal(blockedBody.readyFor.fullLoop, false);

    const blockedJoin = evaluatePlayworldsAttributionJoin({
      blockOnOrphanCallbacks: true,
      orphanCallbacks: 1,
    });
    assert.equal(evaluatePlayworldsFullLoopReadiness({
      sourceProbeReady: true,
      conversionCallbackConfigured: true,
      callbackHandshakeRecent: true,
      attributionJoinReady: blockedJoin.ready,
    }), false, "an orphan blocks an otherwise complete full-loop probe");
    assert.equal(evaluatePlayworldsFullLoopReadiness({
      sourceProbeReady: true,
      conversionCallbackConfigured: true,
      callbackHandshakeRecent: true,
      attributionJoinReady: true,
    }), true, "the same complete probe is ready after the join is healthy");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("conversion receiver keeps unknown and retired sources as visible orphans and enforces exact idempotency", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    process.env.PLAYWORLDS_CALLBACK_SECRET = secret;
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    let storeCalls = 0;
    let forcedResult = null;
    const storedPayloads = new Map();
    const storeCommands = [];
    globalThis.fetch = async (_url, init) => {
      storeCalls += 1;
      const command = JSON.parse(String(init?.body));
      storeCommands.push(command);
      if (forcedResult !== null) return Response.json({ result: forcedResult });
      const key = command[3];
      const payload = command[6];
      if (!storedPayloads.has(key)) {
        storedPayloads.set(key, payload);
        return Response.json({ result: 2 });
      }
      return Response.json({ result: storedPayloads.get(key) === payload ? 0 : -4 });
    };
    const occurredAt = new Date();
    const event = {
      schemaVersion: 1,
      producer: "playworlds",
      product: "playworlds",
      eventId,
      clickId,
      sourceSlug: "not-a-published-source",
      event: "trial_started",
      occurredAt: occurredAt.toISOString(),
    };

    let response = await conversionRoute.POST(new Request(
      "http://localhost/api/attribution/playworlds/conversion",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      },
    ));
    assert.equal(response.status, 401);

    response = await conversionRoute.POST(signedRequest(
      "http://localhost/api/attribution/playworlds/conversion",
      { ...event, unexpected: true },
      event.eventId,
      occurredAt,
    ));
    assert.equal(response.status, 400);

    response = await conversionRoute.POST(signedRequest(
      "http://localhost/api/attribution/playworlds/conversion",
      event,
      event.eventId,
      occurredAt,
    ));
    assert.equal(response.status, 202);
    assert.equal((await response.json()).orphan, true);

    const retiredEvent = {
      ...event,
      eventId: "1f24f6a5-77f7-48d8-aaf8-9ccf3a937cd3",
      clickId: "6e9560bf-66ae-42af-b7f6-ea45fdf36cbd",
      sourceSlug: "ai-roleplay-scene-recovery",
    };
    response = await conversionRoute.POST(signedRequest(
      "http://localhost/api/attribution/playworlds/conversion",
      retiredEvent,
      retiredEvent.eventId,
      occurredAt,
    ));
    assert.equal(response.status, 202);
    assert.equal((await response.json()).orphan, true);

    const uppercaseRetry = {
      ...event,
      eventId: event.eventId.toUpperCase(),
      clickId: event.clickId.toUpperCase(),
    };
    response = await conversionRoute.POST(signedRequest(
      "http://localhost/api/attribution/playworlds/conversion",
      uppercaseRetry,
      uppercaseRetry.eventId,
      occurredAt,
    ));
    assert.equal(response.status, 202);
    assert.equal((await response.json()).duplicate, true);

    response = await conversionRoute.POST(signedRequest(
      "http://localhost/api/attribution/playworlds/conversion",
      { ...event, clickId: "7e9560bf-66ae-42af-b7f6-ea45fdf36cbd" },
      event.eventId,
      occurredAt,
    ));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /different payload/);

    forcedResult = -3;
    const missingProductEvent = {
      ...event,
      eventId: "2f24f6a5-77f7-48d8-aaf8-9ccf3a937cd3",
      clickId: "8e9560bf-66ae-42af-b7f6-ea45fdf36cbd",
    };
    response = await conversionRoute.POST(signedRequest(
      "http://localhost/api/attribution/playworlds/conversion",
      missingProductEvent,
      missingProductEvent.eventId,
      occurredAt,
    ));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /non-Playworlds outbound click/);
    assert.equal(storeCalls, 5);
    assert.match(storeCommands[0][1], /return -4/);
    assert.match(storeCommands[0][1], /product ~= "playworlds"/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});
