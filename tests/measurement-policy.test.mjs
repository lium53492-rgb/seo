import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import seoPolicy from "../data/config/seo-policy.json" with { type: "json" };
import unattendedPolicy from "../data/config/unattended-publishing.json" with { type: "json" };
import {
  assertCreatePageMeasurementReadiness,
  evaluateCreatePageMeasurementReadiness,
  evaluateTrafficValidationProbe,
  readMeasurementPhase,
} from "../scripts/lib/measurement-policy.mjs";
import { createDisconnectedReport } from "../lib/seo/default-report.ts";

function supportingMetric(status, source) {
  return {
    status,
    value: status === "observed" ? 0 : null,
    source,
    detail: status === "observed"
      ? "The aggregate supporting metric was observed with a valid zero value."
      : "The aggregate supporting metric was unavailable for this reporting period.",
  };
}

function portfolio({
  searchReady = true,
  landingReady = false,
  outboundReady = false,
  attributionJoinReady = false,
  attributionJoinBlocked = true,
} = {}) {
  return {
    summary: {
      publishedPages: 1,
      collectedPages: 1,
      unavailablePages: 0,
      attributionJoinReady,
      attributionJoinBlocked,
    },
    globalAttribution: {
      schemaVersion: 1,
      product: "playworlds",
      state: attributionJoinReady ? "observed" : "unavailable",
      attributionJoinReady,
      detail: "Optional downstream attribution state is preserved for later product stages.",
    },
    entries: [{
      sourceSlug: "adult-dnd-campaign-prep",
      state: "collected",
      report: {
        metrics: {
          landingUv: supportingMetric(landingReady ? "observed" : "unavailable", "first_party_analytics"),
          qualifiedOutboundClicks: supportingMetric(outboundReady ? "observed" : "unavailable", "seo_redirect"),
        },
        searchPerformance: {
          state: searchReady ? "observed" : "unavailable",
          clicks: searchReady ? 0 : null,
          impressions: searchReady ? 0 : null,
          ctr: searchReady ? 0 : null,
          position: null,
        },
        decisionState: {
          searchPerformanceReady: searchReady,
          landingUvReady: landingReady,
          qualifiedOutboundReady: outboundReady,
        },
      },
    }],
  };
}

test("the active phase makes Search Console the core measurement contract", () => {
  const phase = readMeasurementPhase(seoPolicy);
  assert.equal(phase.id, "early_traffic_validation");
  assert.deepEqual(phase.primaryMetrics, [
    "search_console_impressions",
    "search_console_clicks",
    "search_console_ctr",
    "search_console_average_position",
  ]);
  assert.equal(phase.publicationGate.requireObservedSearchConsoleForEveryPublishedPage, true);
  assert.equal(phase.publicationGate.requireObservedLandingUvForEveryPublishedPage, false);
  assert.equal(phase.publicationGate.requireObservedQualifiedOutboundForEveryPublishedPage, false);
  assert.equal(phase.publicationGate.requireAttributionJoinReady, false);
  assert.equal(phase.publicationGate.requireRevenueOutcomes, false);
});

test("observed zero Search Console data passes without UV, outbound, callback, or revenue readiness", () => {
  const result = assertCreatePageMeasurementReadiness({
    portfolio: portfolio(),
    policy: seoPolicy,
    unattendedPolicy,
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.failures, []);
});

test("missing exact-page Search Console evidence still blocks early traffic validation", () => {
  const result = evaluateCreatePageMeasurementReadiness({
    portfolio: portfolio({ searchReady: false }),
    policy: seoPolicy,
    unattendedPolicy,
  });
  assert.equal(result.ready, false);
  assert.match(result.failures.join(" "), /Search Console evidence is unavailable/);
});

test("the readiness probe ignores optional callback and revenue state", () => {
  const result = evaluateTrafficValidationProbe({
    sources: { searchConsole: { configured: true } },
    probe: {
      searchConsole: { state: "observed" },
      landingUv: { state: "unavailable" },
      attributionStore: { state: "unavailable" },
    },
    readyFor: { fullLoop: false },
  }, seoPolicy);
  assert.equal(result.ready, true);
  assert.equal(result.callbackOrRevenueRequired, false);
});

test("current fallback reporting uses early traffic language", () => {
  const report = createDisconnectedReport();
  assert.match(report.headline, /early traffic-validation/i);
  assert.doesNotMatch(report.headline, /revenue-first/i);
  assert.equal(
    report.integrations.find((item) => item.id === "product_analytics")?.name,
    "Optional Downstream Attribution",
  );

  const workflow = readFileSync(
    new URL("../docs/seo/engineering-workflow.md", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /^# Early traffic-validation SEO engineering workflow/m);
  assert.doesNotMatch(workflow, /Revenue-first SEO engineering workflow/);
});
