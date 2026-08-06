import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalSiteOrigin,
  configuredProductionSiteOrigin,
  legacySiteOrigins,
} from "../scripts/lib/site-origin.mjs";

test("automation scripts share the canonical LoreLens origin contract", () => {
  assert.equal(canonicalSiteOrigin, "https://lorelens.novelai.ai");
  assert.deepEqual(
    [...legacySiteOrigins],
    ["https://seo-pi-fawn.vercel.app"],
  );
  assert.equal(
    configuredProductionSiteOrigin(undefined, "fixture"),
    canonicalSiteOrigin,
  );
  assert.equal(
    configuredProductionSiteOrigin("https://lorelens.novelai.ai/", "fixture"),
    canonicalSiteOrigin,
  );
});

test("automation scripts reject stale or non-root public report origins", () => {
  for (const value of [
    "https://seo-pi-fawn.vercel.app",
    "http://lorelens.novelai.ai",
    "https://reader:secret@lorelens.novelai.ai",
    "https://lorelens.novelai.ai/report",
    "https://lorelens.novelai.ai?preview=1",
    "https://lorelens.novelai.ai#preview",
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
