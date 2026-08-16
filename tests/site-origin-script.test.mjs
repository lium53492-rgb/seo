import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalSiteOrigin,
  configuredProductionSiteOrigin,
  legacySiteOrigins,
} from "../scripts/lib/site-origin.mjs";

test("automation scripts share the canonical Playworlds Guides origin contract", () => {
  assert.equal(canonicalSiteOrigin, "https://guides.playworlds.ai");
  assert.deepEqual(
    [...legacySiteOrigins],
    ["https://seo-pi-fawn.vercel.app", "https://lorelens.novelai.ai"],
  );
  assert.equal(
    configuredProductionSiteOrigin(undefined, "fixture"),
    canonicalSiteOrigin,
  );
  assert.equal(
    configuredProductionSiteOrigin("https://guides.playworlds.ai/", "fixture"),
    canonicalSiteOrigin,
  );
});

test("automation scripts reject stale or non-root public report origins", () => {
  for (const value of [
    "https://seo-pi-fawn.vercel.app",
    "https://lorelens.novelai.ai",
    "http://guides.playworlds.ai",
    "https://reader:secret@guides.playworlds.ai",
    "https://guides.playworlds.ai/report",
    "https://guides.playworlds.ai?preview=1",
    "https://guides.playworlds.ai#preview",
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
});
