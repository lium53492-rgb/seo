import assert from "node:assert/strict";
import test from "node:test";
import seoPolicy from "../data/config/seo-policy.json" with { type: "json" };
import architecturePolicy from "../data/config/content-architecture.json" with { type: "json" };
import {
  deriveDailyRunState,
  isDailyNoPublishReceipt,
  shanghaiDate,
} from "../scripts/lib/daily-run-state.mjs";

const date = "2026-08-07";
const growth = { generatedAt: "2026-08-07T01:00:00.000Z" };
const research = { policyVersion: 4 };
const report = {
  id: "seo-2026-08-07",
  date,
  generatedAt: "2026-08-07T01:10:00.000Z",
  draft: {
    schemaVersion: architecturePolicy.requiredDraftSchemaVersion,
    slug: "/daily-page",
    quality: { passed: true },
  },
  publication: {
    status: "ready_for_review",
    slug: "daily-page",
    draftDigest: "a".repeat(64),
  },
};
const review = {
  schemaVersion: 1,
  reportId: report.id,
  slug: "daily-page",
  decision: "approved",
  reviewerType: "codex_editor",
  reviewer: "Codex editor",
  reviewedAt: "2026-08-07T01:20:00.000Z",
  notes: "The independent review approved the complete daily publishing contract.",
  draftDigest: report.publication.draftDigest,
  checks: [...seoPolicy.requiredReviewChecks, ...architecturePolicy.requiredReviewChecks].map((id) => ({
    id,
    passed: true,
    detail: `The independent review passed the ${id} contract.`,
  })),
};
const page = {
  slug: "daily-page",
  status: "published",
  publishedAt: "2026-08-07T01:30:00.000Z",
  generatedFromReport: report.id,
  draftDigest: review.draftDigest,
  editorialReview: review,
};
const noPublishReceipt = {
  schemaVersion: 1,
  date,
  outcome: "no_publish",
  reasonCode: "growth_unavailable",
  reason: "The protected growth endpoint remained unavailable after the configured retries.",
  recordedAt: "2026-08-07T02:00:00.000Z",
  artifactDigests: [{
    path: `data/growth/${date}.json`,
    sha256: "c".repeat(64),
    bytes: 128,
  }],
  evidenceSummary: {
    dailyState: "resume_research",
    growth: {
      publishedPages: 9,
      collectedPages: 0,
      unavailablePages: 9,
      attributionJoinReady: false,
    },
    trends: { recorded: 0, observed: 0, qualifying: 0 },
    publicationStatus: "absent",
    reviewDecision: "absent",
  },
};

test("daily state starts exactly one page when no artifacts exist", () => {
  assert.deepEqual(deriveDailyRunState({ date }).state, "start");
  assert.equal(deriveDailyRunState({ date }).mayCreatePage, true);
});

test("a valid no-publish receipt is terminal and cannot occupy a published-page slot", () => {
  const terminal = deriveDailyRunState({ date, growth, noPublishReceipt });
  assert.equal(terminal.state, "no_publish_complete");
  assert.equal(terminal.resumeAt, null);
  assert.equal(terminal.mayCreatePage, false);
  assert.equal(terminal.publishedSlug, null);

  const conflict = deriveDailyRunState({ date, growth, pages: [page], noPublishReceipt });
  assert.equal(conflict.state, "conflict");
  assert.match(conflict.conflicts.join(" "), /cannot coexist with a page published/);
});

test("daily state resumes each valid partial stage", () => {
  assert.equal(deriveDailyRunState({ date, growth }).resumeAt, "research");
  assert.equal(deriveDailyRunState({ date, growth, research }).resumeAt, "build");
  assert.equal(deriveDailyRunState({ date, growth, research, report }).resumeAt, "review");
  assert.equal(deriveDailyRunState({ date, growth, research, report, review }).resumeAt, "publish");
});

test("daily state never creates a second page after local publication", () => {
  const publishedReport = { ...report, publication: { ...report.publication, status: "published", slug: "daily-page" } };
  const state = deriveDailyRunState({ date, growth, research, report: publishedReport, review, pages: [page] });
  assert.equal(state.state, "resume_after_publication");
  assert.equal(state.mayCreatePage, false);
  assert.equal(state.publishedSlug, "daily-page");
});

test("daily state advances a complete local delivery to release verification", () => {
  const publishedReport = { ...report, publication: { ...report.publication, status: "published", slug: "daily-page" } };
  const state = deriveDailyRunState({ date, growth, research, report: publishedReport, review, pages: [page], pdfExists: true });
  assert.equal(state.state, "local_publication_complete");
  assert.equal(state.resumeAt, "release_verification");
});

test("current no-publish receipts require research/report evidence and an active reason", () => {
  const currentReceipt = {
    ...noPublishReceipt,
    schemaVersion: 2,
    artifactDigests: [
      ...noPublishReceipt.artifactDigests,
      { path: `data/research/${date}.json`, sha256: "d".repeat(64), bytes: 256 },
      { path: `data/reports/${date}.json`, sha256: "e".repeat(64), bytes: 256 },
    ],
  };
  assert.equal(isDailyNoPublishReceipt(currentReceipt, date), true);
  assert.equal(isDailyNoPublishReceipt({
    ...currentReceipt,
    reasonCode: "trends_not_observed",
  }, date), false);
  assert.equal(isDailyNoPublishReceipt({
    ...currentReceipt,
    artifactDigests: noPublishReceipt.artifactDigests,
  }, date), false);
});

test("an explicit same-day retirement receipt is terminal without authorizing a second page", () => {
  const publishedReport = {
    ...report,
    publication: {
      ...report.publication,
      status: "published",
      slug: "daily-page",
      publishedAt: page.publishedAt,
    },
  };
  const maintenanceRecords = [{
    schemaVersion: 1,
    createdAt: "2026-08-07T02:00:00.000Z",
    authorization: "Direct user instruction recorded for this exact page retirement.",
    retiredPages: ["daily-page"],
    retiredPublications: [{
      schemaVersion: 1,
      action: "retire_published_page",
      originalPublicationDate: date,
      slug: "daily-page",
      reportId: report.id,
      draftDigest: review.draftDigest,
      publishedAt: page.publishedAt,
      retiredAt: "2026-08-07T02:00:00.000Z",
    }],
  }];
  const state = deriveDailyRunState({
    date,
    growth,
    research,
    report: publishedReport,
    review,
    pages: [],
    pdfExists: true,
    maintenanceRecords,
  });
  assert.equal(state.state, "retired_publication_complete");
  assert.equal(state.resumeAt, null);
  assert.equal(state.mayCreatePage, false);
  assert.equal(state.retiredSlug, "daily-page");
  assert.deepEqual(state.retiredSlugs, ["daily-page"]);
});

test("daily retirement state validates every publication from the same historical report", () => {
  const firstSlug = "legacy-morning-page";
  const secondSlug = "legacy-afternoon-page";
  const legacyReport = {
    id: `seo-${date}`,
    date,
    publication: {
      status: "published",
      slug: firstSlug,
      publishedAt: "2026-08-07T01:30:00.000Z",
    },
    publications: [
      { status: "published", slug: firstSlug, publishedAt: "2026-08-07T01:30:00.000Z" },
      { status: "published", slug: secondSlug, publishedAt: "2026-08-07T03:30:00.000Z" },
    ],
  };
  const receipts = legacyReport.publications.map((publication) => ({
    schemaVersion: 1,
    action: "retire_published_page",
    originalPublicationDate: date,
    slug: publication.slug,
    reportId: legacyReport.id,
    draftDigest: null,
    publishedAt: publication.publishedAt,
    retiredAt: "2026-08-08T02:00:00.000Z",
  }));
  const maintenanceRecord = {
    schemaVersion: 1,
    authorization: "Direct user instruction recorded for both exact historical page retirements.",
    retiredPages: [firstSlug, secondSlug],
    retiredPublications: receipts,
  };

  const complete = deriveDailyRunState({
    date,
    report: legacyReport,
    pages: [],
    maintenanceRecords: [maintenanceRecord],
  });
  assert.equal(complete.state, "retired_publication_complete");
  assert.equal(complete.retiredSlug, firstSlug);
  assert.deepEqual(complete.retiredSlugs, [firstSlug, secondSlug]);
  assert.equal(complete.retirementReceipts.length, 2);

  const incomplete = deriveDailyRunState({
    date,
    report: legacyReport,
    pages: [],
    maintenanceRecords: [{ ...maintenanceRecord, retiredPublications: [receipts[0]] }],
  });
  assert.equal(incomplete.state, "conflict");
  assert.match(incomplete.conflicts.join(" "), /missing its retirement receipt/i);
});

test("daily state fails closed on inconsistent or duplicate publication", () => {
  const publishedReport = { ...report, publication: { ...report.publication, status: "published", slug: "daily-page" } };
  const duplicate = { ...page, slug: "second-page" };
  const state = deriveDailyRunState({ date, growth, research, report: publishedReport, review, pages: [page, duplicate] });
  assert.equal(state.state, "conflict");
  assert.equal(state.mayCreatePage, false);
  assert.ok(state.conflicts.length >= 1);
});

test("daily state resumes publisher finalization after a page-first crash", () => {
  const state = deriveDailyRunState({ date, growth, research, report, review, pages: [page] });
  assert.equal(state.state, "resume_publish");
  assert.equal(state.resumeAt, "publish");
  assert.equal(state.mayCreatePage, false);
});

test("daily state rejects an unbound partial artifact chain", () => {
  assert.equal(deriveDailyRunState({ date, research }).state, "conflict");
  assert.equal(
    deriveDailyRunState({
      date,
      growth,
      research,
      report,
      review: { ...review, draftDigest: "b".repeat(64) },
    }).state,
    "conflict",
  );
  assert.equal(deriveDailyRunState({ date, growth, research, report, pdfExists: true }).state, "conflict");
});

test("Shanghai date classification is stable across the UTC boundary", () => {
  assert.equal(shanghaiDate("2026-08-06T16:30:00.000Z"), "2026-08-07");
  assert.equal(shanghaiDate("2026-08-06T15:59:59.000Z"), "2026-08-06");
});
