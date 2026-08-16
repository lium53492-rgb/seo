import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  isLegacyNovelAiOutboundEligible,
  resolveLegacyNovelAiSource,
} from "../lib/seo/legacy-novelai-outbound.ts";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const policy = JSON.parse(await readFile(join(projectRoot, "data", "config", "seo-policy.json"), "utf8"));
const release = policy.legacyPageGrandfathering.allowlist[0];

test("legacy NovelAI outbound accepts only an exact grandfathered release identity", () => {
  assert.equal(isLegacyNovelAiOutboundEligible({
    slug: release.slug,
    schemaVersion: release.schemaVersion,
    publishedAt: release.publishedAt,
    generatedFromReport: release.generatedFromReport,
    draftDigest: release.draftDigest,
  }, policy), true);

  assert.equal(isLegacyNovelAiOutboundEligible({
    slug: release.slug,
    schemaVersion: policy.contentArchitecture.publishedPageSchemaVersion,
    publishedAt: release.publishedAt,
    generatedFromReport: release.generatedFromReport,
    draftDigest: release.draftDigest,
  }, policy), false, "a current schema page cannot inherit the retired destination");

  assert.equal(isLegacyNovelAiOutboundEligible({
    slug: "future-playworlds-page",
    schemaVersion: policy.contentArchitecture.publishedPageSchemaVersion,
    publishedAt: "2099-01-01T00:00:00.000Z",
    generatedFromReport: "seo-2099-01-01",
    draftDigest: "a".repeat(64),
  }, policy), false, "an unlisted future Playworlds slug must never use the legacy route");
});

test("the retired route applies the legacy eligibility guard after page-store lookup", async () => {
  const route = await readFile(join(projectRoot, "app", "go", "novelai", "[slug]", "route.ts"), "utf8");
  assert.match(route, /resolveLegacyNovelAiSource\(slug, readPublishedPage, seoPolicy\)/);
});

test("legacy callback resolution rejects an orphan conversion source for a current Playworlds page", async () => {
  let reads = 0;
  const page = await resolveLegacyNovelAiSource(
    "future-playworlds-page",
    async () => {
      reads += 1;
      return {
        slug: "future-playworlds-page",
        schemaVersion: policy.contentArchitecture.publishedPageSchemaVersion,
        publishedAt: "2099-01-01T00:00:00.000Z",
        generatedFromReport: "seo-2099-01-01",
        draftDigest: "a".repeat(64),
      };
    },
    policy,
  );
  assert.equal(reads, 1);
  assert.equal(page, null, "the retired callback must stop before orphan persistence");

  const conversionRoute = await readFile(
    join(projectRoot, "app", "api", "attribution", "conversion", "route.ts"),
    "utf8",
  );
  assert.match(
    conversionRoute,
    /resolveLegacyNovelAiSource\(event\.sourceSlug, readPublishedPage, seoPolicy\)/,
  );
});
