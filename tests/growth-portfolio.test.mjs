import assert from "node:assert/strict";
import test from "node:test";
import {
  collectGrowthPortfolio,
  completeShanghaiWindow,
  countSearchValidatedLandingPages,
  evaluateConsolidationEvidence,
  evaluateGrowthFeedbackGate,
  shanghaiDate,
} from "../scripts/lib/growth-portfolio.mjs";

const unavailable = (source, detail) => ({
  status: "unavailable",
  value: null,
  source,
  detail,
});

function collectedReport(page, period) {
  return {
    sourceSlug: page.slug,
    funnel: {
      schemaVersion: 1,
      aggregationKey: "source_slug+reporting_period",
      conversionJoinKey: "seo_click_id",
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      metrics: {
        organicClicks: unavailable("search_console", "Search Console was not connected in this fixture."),
        landingUv: { status: "observed", value: 12, source: "vercel_analytics", detail: "Observed page UV." },
        qualifiedOutboundClicks: { status: "observed", value: 3, source: "seo_redirect", detail: "Observed redirect clicks." },
        trialStarts: { status: "observed", value: 2, source: "product_analytics", detail: "Private fixture value." },
        signups: { status: "observed", value: 1, source: "product_analytics", detail: "Private fixture value." },
        paidConversions: { status: "observed", value: 1, source: "payments", detail: "Private fixture value." },
        revenueMinor: { status: "observed", value: 1299, source: "payments", detail: "Private fixture value." },
      },
      currency: "USD",
    },
    pageviews: 19,
    outboundRequests: 3,
    purchaseEvents: 1,
    orphanCallbacks: 0,
    revenueByCurrency: { USD: 1299 },
    ctaLocations: { header: 1, final_cta: 2 },
    searchPerformance: {
      state: "unavailable",
      sourceSlug: page.slug,
      pageUrl: `https://seo.example/${page.slug}`,
      startDate: period.periodStart.slice(0, 10),
      endDate: period.periodEnd.slice(0, 10),
      clicks: null,
      impressions: null,
      ctr: null,
      position: null,
      detail: "Search Console was not configured in this fixture.",
    },
    urlInspection: {
      state: "observed",
      sourceSlug: page.slug,
      pageUrl: `https://seo.example/${page.slug}`,
      inspectedAt: "2026-07-23T03:30:00.000Z",
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      robotsTxtState: "ALLOWED",
      indexingState: "INDEXING_ALLOWED",
      pageFetchState: "SUCCESSFUL",
      lastCrawlTime: "2026-07-22T03:30:00.000Z",
      googleCanonical: `https://other.example/${page.slug}?private=1`,
      userCanonical: `https://user:password@seo.example/${page.slug}?draft=1#section`,
      crawledAs: "MOBILE",
      sitemap: ["https://seo.example/sitemap.xml"],
      detail: "Observed the indexed-version URL Inspection result in this fixture.",
    },
  };
}

function objectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const item of value) objectKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    objectKeys(child, keys);
  }
  return keys;
}

test("growth windows contain only complete Shanghai calendar days", () => {
  const now = new Date("2026-07-23T03:30:00.000Z");
  const period = completeShanghaiWindow(28, now);
  assert.deepEqual(period, {
    periodStart: "2026-06-21T16:00:00.000Z",
    periodEnd: "2026-07-19T16:00:00.000Z",
  });
  assert.deepEqual(completeShanghaiWindow(28, now, 0), {
    periodStart: "2026-06-24T16:00:00.000Z",
    periodEnd: "2026-07-22T16:00:00.000Z",
  });
  assert.equal(shanghaiDate(now), "2026-07-23");
  assert.throws(() => completeShanghaiWindow(0, now), /1 to 93/);
  assert.throws(() => completeShanghaiWindow(94, now), /1 to 93/);
  assert.throws(() => completeShanghaiWindow(28, now, 15), /0 to 14/);
});

test("missing credentials are explicit and never converted into zero metrics", async () => {
  let fetchCalls = 0;
  const pages = [{ slug: "interactive-voice-story", path: "/interactive-voice-story", keyword: "interactive voice story" }];
  const snapshot = await collectGrowthPortfolio({
    pages,
    automationToken: "",
    now: new Date("2026-07-23T03:30:00.000Z"),
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("must not fetch without credentials");
    },
  });

  assert.equal(fetchCalls, 0);
  assert.deepEqual(snapshot.summary, {
    publishedPages: 1,
    collectedPages: 0,
    unavailablePages: 1,
    attributionJoinReady: false,
    attributionJoinBlocked: false,
    hasSearchValidatedLandingPage: false,
  });
  assert.equal(snapshot.entries[0].state, "unavailable");
  assert.match(snapshot.entries[0].reason, /SEO_AUTOMATION_TOKEN/);
});

test("collector authenticates and keeps every page bound to the same reporting period", async () => {
  const now = new Date("2026-07-23T03:30:00.000Z");
  const period = completeShanghaiWindow(28, now);
  const pages = [
    { slug: "interactive-voice-story", path: "/interactive-voice-story", keyword: "interactive voice story" },
    { slug: "story-based-ai-roleplay", path: "/story-based-ai-roleplay", keyword: "story based ai roleplay" },
  ];
  const requested = [];
  const snapshot = await collectGrowthPortfolio({
    pages,
    automationToken: "fixture-secret-with-at-least-32-bytes",
    siteUrl: "https://seo.example/",
    now,
    fetchImpl: async (url, init) => {
      requested.push({ url: new URL(url), authorization: init.headers.authorization });
      const page = pages.find((candidate) => candidate.slug === new URL(url).searchParams.get("sourceSlug"));
      return new Response(JSON.stringify(collectedReport(page, period)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(snapshot.summary.collectedPages, 2);
  assert.equal(snapshot.summary.unavailablePages, 0);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.privacyClass, "public_growth_evidence");
  assert.equal(snapshot.reportingWindowDays, 28);
  assert.equal(snapshot.reportingLagDays, 3);
  assert.equal(snapshot.summary.attributionJoinReady, true);
  assert.equal(snapshot.summary.attributionJoinBlocked, false);
  assert.equal(snapshot.entries[0].report.metrics.landingUv.value, 12);
  assert.equal(snapshot.entries[0].report.metrics.qualifiedOutboundClicks.value, 3);
  assert.equal(snapshot.entries[0].report.decisionState.attributionJoinChecked, true);
  assert.deepEqual(snapshot.entries[0].report.urlInspection.sitemap, []);
  assert.equal(snapshot.entries[0].report.urlInspection.googleCanonical, null);
  assert.equal(
    snapshot.entries[0].report.urlInspection.userCanonical,
    "https://seo.example/interactive-voice-story",
  );
  const forbiddenKeys = new Set([
    "conversionJoinKey",
    "funnel",
    "trialStarts",
    "signups",
    "paidConversions",
    "revenueMinor",
    "currency",
    "purchaseEvents",
    "orphanCallbacks",
    "revenueByCurrency",
    "pageviews",
    "outboundRequests",
    "ctaLocations",
  ]);
  assert.deepEqual(
    objectKeys(snapshot).filter((key) => forbiddenKeys.has(key)),
    [],
  );
  assert.equal(requested.length, 2);
  for (const request of requested) {
    assert.equal(request.url.protocol, "https:");
    assert.equal(request.url.searchParams.get("from"), period.periodStart);
    assert.equal(request.url.searchParams.get("to"), period.periodEnd);
    assert.equal(request.authorization, "Bearer fixture-secret-with-at-least-32-bytes");
  }
});

test("collector rejects unsafe origins and malformed page metadata before fetching", async () => {
  const page = { slug: "interactive-voice-story", path: "/interactive-voice-story", keyword: "interactive voice story" };
  await assert.rejects(
    collectGrowthPortfolio({ pages: [page], siteUrl: "http://seo.example", automationToken: "secret" }),
    /must use HTTPS/,
  );
  await assert.rejects(
    collectGrowthPortfolio({ pages: [{ ...page, path: "/other" }], automationToken: "secret" }),
    /matching path/,
  );
  await assert.rejects(
    collectGrowthPortfolio({ pages: [page, page], automationToken: "secret" }),
    /Duplicate/,
  );
});

test("collector does not publish an observed URL Inspection shell without decision fields", async () => {
  const now = new Date("2026-07-23T03:30:00.000Z");
  const period = completeShanghaiWindow(28, now);
  const page = {
    slug: "interactive-voice-story",
    path: "/interactive-voice-story",
    keyword: "interactive voice story",
  };
  const privateReport = collectedReport(page, period);
  privateReport.urlInspection = {
    ...privateReport.urlInspection,
    verdict: null,
    coverageState: null,
    robotsTxtState: null,
    indexingState: null,
    pageFetchState: null,
    lastCrawlTime: null,
    googleCanonical: null,
    userCanonical: null,
    crawledAs: null,
    sitemap: [],
  };
  const snapshot = await collectGrowthPortfolio({
    pages: [page],
    automationToken: "fixture-secret-with-at-least-32-bytes",
    siteUrl: "https://seo.example/",
    now,
    fetchImpl: async () => new Response(JSON.stringify(privateReport), { status: 200 }),
  });
  assert.equal(snapshot.entries[0].state, "unavailable");
  assert.match(snapshot.entries[0].reason, /safe public page snapshot/);
});

test("feedback gate stops blind fifth-page production and orphan attribution", () => {
  const policy = {
    coldStartPublishedPageLimit: 4,
    minimumSearchValidatedLandingPages: 1,
    blockOnOrphanCallbacks: true,
  };
  assert.equal(evaluateGrowthFeedbackGate({
    publicationMode: "create",
    hasDraft: true,
    publishedPageCount: 4,
    searchValidatedLandingPages: 0,
    orphanCallbacks: 0,
    policy,
  }).passed, false);
  assert.equal(evaluateGrowthFeedbackGate({
    publicationMode: "create",
    hasDraft: true,
    publishedPageCount: 4,
    searchValidatedLandingPages: 1,
    orphanCallbacks: 1,
    policy,
  }).passed, false);
  assert.equal(evaluateGrowthFeedbackGate({
    publicationMode: "create",
    hasDraft: true,
    publishedPageCount: 4,
    searchValidatedLandingPages: 1,
    orphanCallbacks: 0,
    policy,
  }).passed, true);
});

test("only same-page UV plus exact-page search evidence unlocks expansion", () => {
  const entry = {
    state: "collected",
    report: {
      metrics: {
        landingUv: { status: "observed", value: 12 },
      },
      searchPerformance: {
        state: "unavailable",
        impressions: null,
      },
    },
  };

  assert.equal(countSearchValidatedLandingPages([entry]), 0);
  entry.report.searchPerformance = { state: "observed", impressions: 0 };
  assert.equal(countSearchValidatedLandingPages([entry]), 0);
  entry.report.searchPerformance = { state: "observed", impressions: 2 };
  entry.report.metrics.landingUv.value = 0;
  assert.equal(countSearchValidatedLandingPages([entry]), 0);
  entry.report.metrics.landingUv.value = 12;
  assert.equal(countSearchValidatedLandingPages([entry]), 1);
});

test("consolidation requires two-page query overlap and a usable self-canonical target", () => {
  const searchPerformance = (sourceSlug, impressions) => ({
    state: "observed",
    sourceSlug,
    pageUrl: `https://seo.example/${sourceSlug}`,
    startDate: "2026-06-22",
    endDate: "2026-07-19",
    clicks: 2,
    impressions,
    ctr: 2 / impressions,
    position: 12,
    detail: "Observed finalized exact-page Search Console evidence.",
  });
  const urlInspection = (sourceSlug) => ({
    state: "observed",
    sourceSlug,
    pageUrl: `https://seo.example/${sourceSlug}`,
    inspectedAt: "2026-07-23T03:30:00.000Z",
    verdict: "PASS",
    coverageState: "Submitted and indexed",
    robotsTxtState: "ALLOWED",
    indexingState: "INDEXING_ALLOWED",
    pageFetchState: "SUCCESSFUL",
    lastCrawlTime: "2026-07-22T03:30:00.000Z",
    googleCanonical: `https://seo.example/${sourceSlug}`,
    userCanonical: `https://seo.example/${sourceSlug}`,
    crawledAs: "MOBILE",
    sitemap: ["https://seo.example/sitemap.xml"],
    detail: "Observed indexed-version URL Inspection evidence.",
  });
  const entries = ["source-page", "target-page"].map((sourceSlug, index) => ({
    sourceSlug,
    path: `/${sourceSlug}`,
    keyword: sourceSlug,
    state: "collected",
    report: {
      sourceSlug,
      searchPerformance: searchPerformance(sourceSlug, index ? 40 : 25),
      urlInspection: urlInspection(sourceSlug),
    },
  }));
  const performance = ["source-page", "target-page"].map((sourceSlug) => ({
    url: `https://seo.example/${sourceSlug}`,
    query: "shared roleplay query",
    clicks: 1,
    impressions: 20,
    ctr: 0.05,
    position: 10,
  }));
  const decision = {
    action: "consolidate",
    sourceSlug: "source-page",
    targetSlug: "target-page",
    overlapQueries: ["shared roleplay query"],
  };

  assert.equal(evaluateConsolidationEvidence({
    decision: { ...decision, sourceSlug: null },
    entries,
    performance,
  }).passed, false);
  assert.equal(evaluateConsolidationEvidence({
    decision,
    entries,
    performance: performance.slice(0, 1),
  }).passed, false);
  entries[0].report.searchPerformance.impressions = 2;
  assert.equal(evaluateConsolidationEvidence({
    decision,
    entries,
    performance,
  }).passed, false);
  entries[0].report.searchPerformance.impressions = 25;
  entries[1].report.urlInspection.coverageState = "URL is unknown to Google";
  entries[1].report.urlInspection.pageFetchState = null;
  assert.equal(evaluateConsolidationEvidence({
    decision,
    entries,
    performance,
  }).passed, false);
  entries[1].report.urlInspection = urlInspection("target-page");
  assert.equal(evaluateConsolidationEvidence({
    decision,
    entries,
    performance,
  }).passed, true);
});
