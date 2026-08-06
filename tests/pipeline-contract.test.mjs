import assert from "node:assert/strict";
import test from "node:test";
import seoPolicy from "../data/config/seo-policy.json" with { type: "json" };
import architecturePolicy from "../data/config/content-architecture.json" with { type: "json" };
import {
  repositoryPublicationStage,
  requiredReviewCheckIds,
  validatePipelineReviewContract,
} from "../lib/seo/pipeline-contract.mjs";

const digest = "a".repeat(64);
const baseChecks = seoPolicy.requiredReviewChecks.map((id) => ({
  id,
  passed: true,
  detail: `Editorial approval passed for ${id}.`,
}));
const architectureChecks = architecturePolicy.requiredReviewChecks.map((id) => ({
  id,
  passed: true,
  detail: `Architecture approval passed for ${id}.`,
}));

function reviewWith(checks) {
  return {
    schemaVersion: 1,
    reportId: "seo-2099-01-01",
    slug: "distinct-roleplay-guide",
    decision: "approved",
    reviewerType: "codex_editor",
    reviewer: "Codex editor",
    reviewedAt: "2099-01-01T12:00:00.000Z",
    notes: "The independent editorial pass verified every required contract.",
    draftDigest: digest,
    checks,
  };
}

function validate(review, draftSchemaVersion) {
  return validatePipelineReviewContract({
    review,
    reportId: "seo-2099-01-01",
    expectedSlug: "distinct-roleplay-guide",
    expectedDigest: digest,
    reportGeneratedAt: "2099-01-01T11:00:00.000Z",
    draftSchemaVersion,
    requiredDraftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
    baseRequiredChecks: seoPolicy.requiredReviewChecks,
    architectureRequiredChecks: architecturePolicy.requiredReviewChecks,
  });
}

test("pipeline review checks mirror the publisher schema boundary", () => {
  assert.deepEqual(
    requiredReviewCheckIds({
      draftSchemaVersion: null,
      requiredDraftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
      baseRequiredChecks: seoPolicy.requiredReviewChecks,
      architectureRequiredChecks: architecturePolicy.requiredReviewChecks,
    }),
    seoPolicy.requiredReviewChecks,
  );
  assert.deepEqual(
    requiredReviewCheckIds({
      draftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
      requiredDraftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
      baseRequiredChecks: seoPolicy.requiredReviewChecks,
      architectureRequiredChecks: architecturePolicy.requiredReviewChecks,
    }),
    [...seoPolicy.requiredReviewChecks, ...architecturePolicy.requiredReviewChecks],
  );
});

test("legacy review remains valid with the four base checks", () => {
  assert.equal(validate(reviewWith(baseChecks), null), true);
});

test("schema 2 draft cannot become review_ready without all architecture checks", () => {
  assert.equal(
    validate(reviewWith(baseChecks), architecturePolicy.requiredDraftSchemaVersion),
    false,
  );
  assert.equal(
    validate(
      reviewWith([...baseChecks, ...architectureChecks]),
      architecturePolicy.requiredDraftSchemaVersion,
    ),
    true,
  );
});

test("architecture checks use the publisher's passed and detail contract", () => {
  const checks = [...baseChecks, ...architectureChecks].map((check) =>
    check.id === "rendered-preview" ? { ...check, detail: "too short" } : check
  );
  assert.equal(
    validate(reviewWith(checks), architecturePolicy.requiredDraftSchemaVersion),
    false,
  );
});

test("review readiness fails closed without publisher bindings", () => {
  const approved = reviewWith([...baseChecks, ...architectureChecks]);
  const shared = {
    review: approved,
    draftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
    requiredDraftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
    baseRequiredChecks: seoPolicy.requiredReviewChecks,
    architectureRequiredChecks: architecturePolicy.requiredReviewChecks,
    reportGeneratedAt: "2099-01-01T11:00:00.000Z",
    reportId: "seo-2099-01-01",
    expectedSlug: "distinct-roleplay-guide",
    expectedDigest: digest,
  };
  assert.equal(validatePipelineReviewContract({ ...shared, reportId: null }), false);
  assert.equal(validatePipelineReviewContract({ ...shared, expectedSlug: null }), false);
  assert.equal(validatePipelineReviewContract({ ...shared, expectedDigest: null }), false);
  assert.equal(validatePipelineReviewContract({ ...shared, reportGeneratedAt: null }), false);
});

test("local report publication is repository_published, not deployment evidence", () => {
  assert.equal(repositoryPublicationStage("published"), "repository_published");
  assert.equal(repositoryPublicationStage("ready_for_review"), null);
});
