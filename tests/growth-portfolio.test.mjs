import assert from "node:assert/strict";
import test from "node:test";
import {
  collectGrowthPortfolio,
  completeShanghaiWindow,
  countSearchValidatedLandingPages,
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
        trialStarts: unavailable("product_analytics", "Trial callbacks are not connected in this fixture."),
        signups: unavailable("product_analytics", "Signup callbacks are not connected in this fixture."),
        paidConversions: unavailable("payments", "Payment callbacks are not connected in this fixture."),
        revenueMinor: unavailable("payments", "Revenue callbacks are not connected in this fixture."),
      },
    },
    pageviews: 19,
    outboundRequests: 3,
    purchaseEvents: null,
    orphanCallbacks: 0,
    revenueByCurrency: {},
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
  };
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
    password: "",
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
  });
  assert.equal(snapshot.entries[0].state, "unavailable");
  assert.match(snapshot.entries[0].reason, /WORKBENCH_PASSWORD/);
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
    password: "fixture-secret",
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
  assert.equal(snapshot.reportingWindowDays, 28);
  assert.equal(snapshot.reportingLagDays, 3);
  assert.equal(requested.length, 2);
  for (const request of requested) {
    assert.equal(request.url.protocol, "https:");
    assert.equal(request.url.searchParams.get("from"), period.periodStart);
    assert.equal(request.url.searchParams.get("to"), period.periodEnd);
    assert.equal(request.authorization, `Basic ${Buffer.from("seo:fixture-secret").toString("base64")}`);
  }
});

test("collector rejects unsafe origins and malformed page metadata before fetching", async () => {
  const page = { slug: "interactive-voice-story", path: "/interactive-voice-story", keyword: "interactive voice story" };
  await assert.rejects(
    collectGrowthPortfolio({ pages: [page], siteUrl: "http://seo.example", password: "secret" }),
    /must use HTTPS/,
  );
  await assert.rejects(
    collectGrowthPortfolio({ pages: [{ ...page, path: "/other" }], password: "secret" }),
    /matching path/,
  );
  await assert.rejects(
    collectGrowthPortfolio({ pages: [page, page], password: "secret" }),
    /Duplicate/,
  );
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
      funnel: {
        metrics: {
          landingUv: { status: "observed", value: 12 },
        },
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
  entry.report.funnel.metrics.landingUv.value = 0;
  assert.equal(countSearchValidatedLandingPages([entry]), 0);
  entry.report.funnel.metrics.landingUv.value = 12;
  assert.equal(countSearchValidatedLandingPages([entry]), 1);
});
