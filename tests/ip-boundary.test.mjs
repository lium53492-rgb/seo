import assert from "node:assert/strict";
import test from "node:test";
import seoPolicy from "../data/config/seo-policy.json" with { type: "json" };
import { originalIpBoundaryBlockers } from "../lib/seo/ip-boundary.mjs";

const originalOnly = {
  schemaVersion: 1,
  contentBasis: "original_tabletop_fantasy",
  dndReferenceScope: "audience_reference_only",
  srdMaterialUsed: false,
  thirdPartyNames: [],
};

function blockers(overrides = {}) {
  return originalIpBoundaryBlockers({
    policy: seoPolicy,
    reportDate: "2026-08-11",
    draftSchemaVersion: 2,
    ipBoundary: originalOnly,
    visibleText: "An adult D&D Game Master prepares an original tabletop campaign.",
    ...overrides,
  });
}

test("the exact original-only contract permits D&D as an audience reference", () => {
  assert.deepEqual(blockers(), []);
  assert.deepEqual(blockers({
    visibleText: "A practical campaign-state guide for D&D players and adult Game Masters.",
  }), []);
  assert.deepEqual(blockers({
    visibleText: seoPolicy.ipBoundary.independenceNotice.body,
  }), []);
  assert.deepEqual(blockers({
    visibleText: "Is Playworlds an official D&D product? No. It is an independent experience for tabletop players.",
  }), []);
});

test("the original-only contract rejects missing, extra, SRD, and named-party declarations", () => {
  assert.ok(blockers({ ipBoundary: undefined }).length > 0);
  assert.ok(blockers({ ipBoundary: { ...originalOnly, licenseUrl: "https://example.com" } }).length > 0);
  assert.ok(blockers({ ipBoundary: { ...originalOnly, srdMaterialUsed: true } }).length > 0);
  assert.ok(blockers({ ipBoundary: { ...originalOnly, thirdPartyNames: ["Vecna"] } }).length > 0);
});

test("visible-content scanning independently blocks audited third-party references", () => {
  for (const name of [
    "Vecna", "Critical Role", "Exandria", "Sword Coast", "Forgotten Realms",
    "Ravenloft", "Dragonlance", "Eberron", "Greyhawk", "Waterdeep",
    "Baldur's Gate", "Neverwinter", "Strahd", "Drizzt", "Elminster",
    "Mind Flayer", "Beholder",
  ]) {
    assert.match(blockers({ visibleText: `An original D&D guide set in ${name}.` }).join("; "), /blocked third-party reference/i);
  }
  assert.match(blockers({ visibleText: "Vecna campaign prep" }).join("; "), /blocked third-party reference/i);
});

test("positive affiliation, sponsorship, licensing, and 5e compatibility claims are blocked", () => {
  for (const claim of [
    "Playworlds is an official D&D product.",
    "This game is a licensed Dungeons & Dragons experience.",
    "Playworlds has been endorsed by Wizards of the Coast.",
    "This product is sponsored by Wizards of the Coast.",
    "Playworlds is affiliated with Wizards of the Coast.",
    "Playworlds is D&D 5e-compatible.",
    "Playworlds supports 5e.",
  ]) {
    assert.match(
      blockers({ visibleText: claim }).join("; "),
      /prohibited D&D affiliation or compatibility claim/i,
    );
  }
});

test("an affirmative FAQ answer cannot hide a prohibited claim inside its question", () => {
  assert.match(
    blockers({
      visibleText: "Is Playworlds an official D&D product? Yes. It is the official experience.",
    }).join("; "),
    /prohibited D&D affiliation or compatibility claim/i,
  );
  assert.deepEqual(blockers({
    visibleText: "Is Playworlds an official D&D product? No. It is an independent experience for tabletop players.",
  }), []);
});

test("the centralized notice is original-only and never emits an SRD or CC attribution", () => {
  const notice = seoPolicy.ipBoundary.independenceNotice;
  assert.equal(notice.srdMaterialUsed, false);
  assert.match(notice.body, /not affiliated with, endorsed by, sponsored by, or licensed by/i);
  assert.doesNotMatch(`${notice.heading} ${notice.body}`, /creative commons|cc by|srd attribution/i);
});

test("pre-enforcement and legacy draft schemas remain readable", () => {
  assert.deepEqual(blockers({ reportDate: "2026-08-10", ipBoundary: undefined }), []);
  assert.deepEqual(blockers({ draftSchemaVersion: 1, ipBoundary: undefined }), []);
});
