import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalPublicPath,
  canonicalPublicUrl,
  canonicalSiteBasePath,
  canonicalSiteOrigin,
  canonicalSiteUrl,
  configuredPrivateServiceOrigin,
  configuredProductionSiteOrigin,
  legacySiteOrigins,
  privateServiceAliases,
  privateServiceOrigin,
  publicAssetBasePath,
} from "../scripts/lib/site-origin.mjs";

test("automation scripts share the canonical Playworlds Guides origin contract", () => {
  assert.equal(canonicalSiteOrigin, "https://www.playworlds.ai");
  assert.equal(canonicalSiteBasePath, "/guides");
  assert.equal(canonicalSiteUrl, "https://www.playworlds.ai/guides");
  assert.equal(publicAssetBasePath, "/playworlds-guides-assets");
  assert.equal(canonicalPublicPath("/example"), "/guides/example");
  assert.equal(canonicalPublicUrl("/example"), "https://www.playworlds.ai/guides/example");
  assert.equal(privateServiceOrigin, "https://lorelens.playworlds.ai");
  assert.deepEqual([...privateServiceAliases], ["https://seo-eight-snowy.vercel.app"]);
  assert.deepEqual(
    [...legacySiteOrigins],
    [
      "https://guides.playworlds.ai",
      "https://seo-pi-fawn.vercel.app",
      "https://lorelens.novelai.ai",
    ],
  );
  assert.equal(
    configuredProductionSiteOrigin(undefined, "fixture"),
    canonicalSiteOrigin,
  );
  assert.equal(
    configuredProductionSiteOrigin("https://www.playworlds.ai/", "fixture"),
    canonicalSiteOrigin,
  );
  assert.equal(configuredPrivateServiceOrigin(undefined, "private fixture"), privateServiceOrigin);
});

test("automation scripts reject stale or non-root public report origins", () => {
  for (const value of [
    "https://seo-pi-fawn.vercel.app",
    "https://lorelens.novelai.ai",
    "http://www.playworlds.ai",
    "https://reader:secret@www.playworlds.ai",
    "https://www.playworlds.ai/report",
    "https://www.playworlds.ai?preview=1",
    "https://www.playworlds.ai#preview",
  ]) {
    assert.throws(
      () => configuredProductionSiteOrigin(value, "fixture"),
      /fixture/,
    );
  }
  assert.equal(
    configuredProductionSiteOrigin("http://127.0.0.1:3000", "fixture"),
    "http://127.0.0.1:3000",
  );
  assert.throws(
    () => configuredPrivateServiceOrigin("https://www.playworlds.ai", "private fixture"),
    /private fixture/,
  );
});
