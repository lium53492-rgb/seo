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

const { readLiveGrowthFunnel, unavailableLiveGrowthFunnel } = await import(
  "../lib/seo/growth-funnel.ts"
);

const managedEnv = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "VERCEL_ANALYTICS_TOKEN",
  "VERCEL_TOKEN",
  "VERCEL_ANALYTICS_PROJECT_ID",
  "VERCEL_ANALYTICS_TEAM_ID",
  "FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT",
  "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL",
  "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY",
  "GOOGLE_SEARCH_CONSOLE_SITE_URL",
  "PLAYWORLDS_CALLBACK_SECRET",
];

function restoreEnvironment(snapshot) {
  for (const key of managedEnv) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

test("live growth reports expose platform-aware outbound aggregates", async () => {
  const environment = Object.fromEntries(managedEnv.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const key of managedEnv) delete process.env[key];
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    globalThis.fetch = async (url) => {
      assert.match(String(url), /example\.upstash\.io\/pipeline$/);
      return Response.json([{
        result: [
          "outboundRequests", "7",
          "qualifiedOutboundClicks", "6",
          "destination:steam:platform", "steam",
          "destination:steam:url", "https://store.steampowered.com/app/4911480/Playworlds/",
          "destination:steam:host", "store.steampowered.com",
          "platform:steam:outboundRequests", "7",
          "platform:steam:qualifiedOutboundClicks", "6",
          "platform:steam:cta:hero", "5",
        ],
      }]);
    };

    const growth = await readLiveGrowthFunnel({
      sourceSlug: "play-an-ai-roleplay-story",
      periodStart: "2026-07-31T16:00:00.000Z",
      periodEnd: "2026-08-01T16:00:00.000Z",
    });

    assert.deepEqual(growth.destinationPlatforms, {
      steam: {
        destinationPlatform: "steam",
        destinationUrl: "https://store.steampowered.com/app/4911480/Playworlds/",
        destinationHost: "store.steampowered.com",
        qualifiedOutboundClicks: 6,
        outboundRequests: 7,
        ctaLocations: { hero: 5 },
      },
    });
    assert.equal(growth.funnel.metrics.qualifiedOutboundClicks.value, 6);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("unavailable growth reports keep the platform summary backward-compatible", () => {
  const growth = unavailableLiveGrowthFunnel({
    sourceSlug: "play-an-ai-roleplay-story",
    periodStart: "2026-07-31T16:00:00.000Z",
    periodEnd: "2026-08-01T16:00:00.000Z",
    detail: "The private attribution report is unavailable in this fixture.",
  });
  assert.deepEqual(growth.destinationPlatforms, {});
});
