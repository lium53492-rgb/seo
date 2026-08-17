import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import playworldsAttribution from "../data/config/playworlds-attribution.json" with { type: "json" };
import {
  buildPlayworldsAttributionUrl,
  playworldsAttributionContract,
} from "../lib/seo/playworlds-attribution.ts";
import {
  recordConversionEvent,
  recordPlayworldsOutboundClick,
} from "../lib/seo/attribution-store.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const clickId = "5e9560bf-66ae-42af-b7f6-ea45fdf36cbd";

test("Playworlds redirect carries the official Steam and versioned attribution contract", () => {
  const url = buildPlayworldsAttributionUrl({
    clickId,
    keyword: "story driven ai voice roleplay adventure",
    location: "hero",
    sourceSlug: "story-driven-ai-voice-roleplay-adventure",
  });

  assert.equal(url.origin, "https://store.steampowered.com");
  assert.equal(url.pathname, "/app/4911480/Playworlds/");
  assert.equal(url.searchParams.get("utm_source"), "playworlds_guides");
  assert.equal(url.searchParams.get("utm_medium"), "organic_landing");
  assert.equal(url.searchParams.get("utm_campaign"), "playworlds_seo");
  assert.equal(url.searchParams.get("utm_content"), "story-driven-ai-voice-roleplay-adventure");
  assert.equal(url.searchParams.get("utm_term"), "story driven ai voice roleplay adventure");
  assert.equal(url.searchParams.get("seo_click_id"), clickId);
  assert.equal(url.searchParams.get("seo_source_slug"), "story-driven-ai-voice-roleplay-adventure");
  assert.equal(url.searchParams.get("seo_cta_location"), "hero");
  assert.equal(url.searchParams.get("seo_product"), "playworlds");
  assert.equal(url.searchParams.get("seo_attribution_version"), "1");
  assert.equal(playworldsAttributionContract.routePrefix, "/go/playworlds");
  assert.equal(playworldsAttribution.events.qualifiedOutbound, "playworlds_qualified_outbound_click");
});

test("Playworlds redirect rejects alternate hosts, apps, credentials, and preloaded query values", () => {
  const build = (destination) => buildPlayworldsAttributionUrl({
    clickId,
    keyword: "ai roleplay adventure",
    location: "final_cta",
    sourceSlug: "ai-roleplay-adventure",
    destination,
  });
  for (const destination of [
    "https://example.com/app/4911480/Playworlds/",
    "https://store.steampowered.com/app/123/Other/",
    "https://user:secret@store.steampowered.com/app/4911480/Playworlds/",
    "https://store.steampowered.com/app/4911480/Playworlds/?redirect=evil",
    "http://store.steampowered.com/app/4911480/Playworlds/",
  ]) {
    assert.throws(() => build(destination), /official HTTPS Steam listing/);
  }
  assert.throws(() => buildPlayworldsAttributionUrl({
    clickId: "not-a-uuid",
    keyword: "ai roleplay adventure",
    location: "hero",
    sourceSlug: "ai-roleplay-adventure",
  }), /click ID must be a UUID/);
});

test("Playworlds outbound storage and page cohorts are product-namespaced", async () => {
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalFetch = globalThis.fetch;
  try {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    let command;
    globalThis.fetch = async (_url, init) => {
      command = JSON.parse(String(init?.body));
      return Response.json({ result: 1 });
    };
    const result = await recordPlayworldsOutboundClick({
      clickId,
      keyword: "story driven ai voice roleplay adventure",
      location: "hero",
      sourceSlug: "story-driven-ai-voice-roleplay-adventure",
      occurredAt: "2026-08-16T18:00:00+08:00",
      qualified: true,
    });
    assert.equal(result.state, "stored");
    assert.match(command.join(" "), /event:outbound:playworlds:/);
    assert.match(command.join(" "), /cohort:playworlds:2026-08-16:story-driven-ai-voice-roleplay-adventure/);
    assert.match(command.join(" "), /playworlds_qualified_outbound_click/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});

test("current CTA and release verifiers use Playworlds while legacy runtime remains isolated", () => {
  const component = readFileSync(join(root, "app/components/TrackedPlayworldsLink.tsx"), "utf8");
  const augustOneRenderer = readFileSync(join(root, "app/[slug]/StageDecisionPage.tsx"), "utf8");
  const augustOneSelector = readFileSync(join(root, "app/[slug]/StageStarterSelector.tsx"), "utf8");
  const decisionRenderer = readFileSync(join(root, "app/[slug]/DecisionMapPage.tsx"), "utf8");
  const route = readFileSync(join(root, "app/go/playworlds/[slug]/route.ts"), "utf8");
  const legacyRoute = readFileSync(join(root, "app/go/novelai/[slug]/route.ts"), "utf8");
  const builtVerifier = readFileSync(join(root, "scripts/verify-built-pages.mjs"), "utf8");
  const liveVerifier = readFileSync(join(root, "scripts/verify-live-release.mjs"), "utf8");

  assert.match(component, /playworldsAttribution\.routePrefix/);
  assert.match(component, /playworldsAttribution\.events\.clientClick/);
  assert.match(augustOneRenderer, /TrackedPlayworldsLink/);
  assert.match(augustOneRenderer, /View Playworlds on Steam/);
  assert.doesNotMatch(augustOneRenderer, /TrackedNovelAiHomeLink|NOVELAI/i);
  assert.match(augustOneSelector, /TrackedPlayworldsLink/);
  assert.doesNotMatch(augustOneSelector, /TrackedNovelAiHomeLink|NOVELAI/i);
  assert.match(decisionRenderer, /TrackedPlayworldsLink/);
  assert.doesNotMatch(decisionRenderer, /TrackedNovelAiHomeLink|NOVELAI/i);
  assert.match(route, /recordPlayworldsOutboundClick/);
  assert.match(route, /export async function HEAD/);
  assert.match(route, /export async function GET/);
  assert.match(legacyRoute, /buildNovelAiAttributionUrl/);
  assert.match(builtVerifier, /playworldsAttribution\.routePrefix/);
  assert.match(builtVerifier, /still contains the retired NovelAI CTA route/);
  assert.match(builtVerifier, /still exposes the retired NovelAI brand/);
  assert.match(liveVerifier, /verifyPlayworldsRedirect/);
  assert.match(liveVerifier, /method: "HEAD"/);
});

test("the retained NovelAI callback refuses a Playworlds click record", async () => {
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalFetch = globalThis.fetch;
  try {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    globalThis.fetch = async () => Response.json({ result: -3 });
    await assert.rejects(recordConversionEvent({
      schemaVersion: 1,
      eventId: "0f24f6a5-77f7-48d8-aaf8-9ccf3a937cd3",
      clickId,
      sourceSlug: "story-driven-ai-voice-roleplay-adventure",
      event: "trial_started",
      occurredAt: "2026-08-16T18:05:00+08:00",
    }), /cannot join a Playworlds outbound click/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});
