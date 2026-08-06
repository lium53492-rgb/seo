function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requiredReviewCheckIds(input) {
  const required = input.draftSchemaVersion === input.requiredDraftSchemaVersion
    ? [...input.baseRequiredChecks, ...input.architectureRequiredChecks]
    : [...input.baseRequiredChecks];
  return [...new Set(required)];
}

export function validatePipelineReviewContract(input) {
  const { review } = input;
  if (typeof input.reportId !== "string" || input.reportId.trim().length === 0 ||
    typeof input.expectedSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.expectedSlug) ||
    typeof input.expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedDigest) ||
    typeof input.reportGeneratedAt !== "string" || !Number.isFinite(Date.parse(input.reportGeneratedAt))) {
    return false;
  }
  const checks = Array.isArray(review.checks) ? review.checks : [];
  const requiredChecks = requiredReviewCheckIds(input);
  const hasRequiredChecks = requiredChecks.every((checkId) => {
    const check = checks.find((item) => isRecord(item) && item.id === checkId);
    return isRecord(check) &&
      check.passed === true &&
      typeof check.detail === "string" &&
      check.detail.trim().length >= 10;
  });

  return review.schemaVersion === 1 &&
    review.decision === "approved" &&
    (review.reviewerType === "codex_editor" || review.reviewerType === "human") &&
    typeof review.reviewer === "string" && review.reviewer.trim().length >= 2 &&
    typeof review.reviewedAt === "string" && Number.isFinite(Date.parse(review.reviewedAt)) &&
    typeof review.notes === "string" && review.notes.trim().length >= 20 &&
    typeof review.draftDigest === "string" && /^[a-f0-9]{64}$/.test(review.draftDigest) &&
    review.draftDigest === input.expectedDigest &&
    Date.parse(review.reviewedAt) >= Date.parse(input.reportGeneratedAt) &&
    typeof review.reportId === "string" &&
    review.reportId === input.reportId &&
    typeof review.slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(review.slug) &&
    review.slug === input.expectedSlug &&
    hasRequiredChecks;
}

export function repositoryPublicationStage(publicationStatus) {
  return publicationStatus === "published" ? "repository_published" : null;
}
