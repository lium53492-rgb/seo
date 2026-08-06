import assert from "node:assert/strict";
import test from "node:test";
import seoPolicy from "../data/config/seo-policy.json" with { type: "json" };
import architecturePolicy from "../data/config/content-architecture.json" with { type: "json" };
import { deriveDailyRunState, shanghaiDate } from "../scripts/lib/daily-run-state.mjs";

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

test("daily state starts exactly one page when no artifacts exist", () => {
  assert.deepEqual(deriveDailyRunState({ date }).state, "start");
  assert.equal(deriveDailyRunState({ date }).mayCreatePage, true);
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
