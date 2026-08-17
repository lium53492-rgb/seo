import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalSiteOrigin,
  configuredProductionSiteOrigin,
  legacySiteOrigins,
} from "../scripts/lib/site-origin.mjs";

test("automation scripts share the canonical Playworlds LoreLens origin contract", () => {
  assert.equal(canonicalSiteOrigin, "https://lorelens.playworlds.ai");
  assert.deepEqual(
    [...legacySiteOrigins],
    [
      "https://guides.playworlds.ai",
      "https://seo-eight-snowy.vercel.app",
      "https://seo-pi-fawn.vercel.app",
      "https://lorelens.novelai.ai",
    ],
  );
  assert.equal(
    configuredProductionSiteOrigin(undefined, "fixture"),
    canonicalSiteOrigin,
  );
  assert.equal(
    configuredProductionSiteOrigin("https://lorelens.playworlds.ai/", "fixture"),
    canonicalSiteOrigin,
  );
});

test("automation scripts reject stale or non-root public report origins", () => {
  for (const value of [
    "https://guides.playworlds.ai",
    "https://seo-eight-snowy.vercel.app",
    "https://seo-pi-fawn.vercel.app",
    "https://lorelens.novelai.ai",
    "http://lorelens.playworlds.ai",
    "https://reader:secret@lorelens.playworlds.ai",
    "https://lorelens.playworlds.ai/report",
    "https://lorelens.playworlds.ai?preview=1",
    "https://lorelens.playworlds.ai#preview",
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
