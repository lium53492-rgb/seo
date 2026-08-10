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
});

test("the original-only contract rejects missing, extra, SRD, and named-party declarations", () => {
  assert.ok(blockers({ ipBoundary: undefined }).length > 0);
  assert.ok(blockers({ ipBoundary: { ...originalOnly, licenseUrl: "https://example.com" } }).length > 0);
  assert.ok(blockers({ ipBoundary: { ...originalOnly, srdMaterialUsed: true } }).length > 0);
  assert.ok(blockers({ ipBoundary: { ...originalOnly, thirdPartyNames: ["Vecna"] } }).length > 0);
});

test("visible-content scanning independently blocks audited third-party references", () => {
  for (const name of ["Vecna", "Critical Role", "Exandria", "Sword Coast"]) {
    assert.match(blockers({ visibleText: `An original D&D guide set in ${name}.` }).join("; "), /blocked third-party reference/i);
  }
  assert.match(blockers({ visibleText: "Vecna campaign prep" }).join("; "), /blocked third-party reference/i);
});

test("pre-enforcement and legacy draft schemas remain readable", () => {
  assert.deepEqual(blockers({ reportDate: "2026-08-10", ipBoundary: undefined }), []);
  assert.deepEqual(blockers({ draftSchemaVersion: 1, ipBoundary: undefined }), []);
});
