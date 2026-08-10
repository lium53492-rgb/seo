function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requiredReviewCheckIds(input) {
  const required = input.draftSchemaVersion === input.requiredDraftSchemaVersion
    ? [...input.baseRequiredChecks, ...input.architectureRequiredChecks]
    : [...input.baseRequiredChecks];
  return [...new Set(required)];
}

function reportDateFromInput(input) {
  const explicit = String(input.reportDate || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  return String(input.reportId || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
}

export function validateVisualAuditContract(input) {
  const policy = input.visualAuditPolicy;
  const reportDate = reportDateFromInput(input);
  const currentDraft = input.draftSchemaVersion === input.requiredDraftSchemaVersion;
  if (currentDraft && !isRecord(policy)) return false;
  const required = currentDraft && reportDate >= String(policy.enforcedFromReportDate || "");
  if (!required) return true;
  if (policy.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(String(policy.enforcedFromReportDate || "")) ||
    typeof policy.previewPathPrefix !== "string" || !policy.previewPathPrefix.startsWith("/") ||
    typeof policy.screenshotDirectory !== "string" || policy.screenshotDirectory.includes("..") ||
    !Array.isArray(policy.viewports) || policy.viewports.length !== 2 ||
    !Number.isFinite(policy.maxHorizontalOverflowPx) || !Number.isInteger(policy.maxUniformNumberedRun)) {
    return false;
  }
  const audit = input.review?.visualAudit;
  if (!isRecord(audit) || audit.schemaVersion !== 1 || audit.passed !== true ||
    audit.draftDigest !== input.expectedDigest ||
    audit.previewPath !== `${policy.previewPathPrefix}${input.expectedSlug}` ||
    typeof audit.inspectedAt !== "string" || !Number.isFinite(Date.parse(audit.inspectedAt)) ||
    Date.parse(audit.inspectedAt) < Date.parse(input.reportGeneratedAt) ||
    Date.parse(input.review?.reviewedAt || "") < Date.parse(audit.inspectedAt) ||
    !Array.isArray(audit.viewports) || audit.viewports.length !== policy.viewports.length) {
    return false;
  }
  const observedIds = new Set(audit.viewports.map((viewport) => viewport?.id));
  if (observedIds.size !== policy.viewports.length) return false;
  return policy.viewports.every((expected) => {
    const observed = audit.viewports.find((viewport) => viewport?.id === expected.id);
    const expectedPath = `${policy.screenshotDirectory}/${reportDate}/${input.expectedSlug}-${expected.id}.png`;
    return isRecord(observed) && observed.width === expected.width && observed.height === expected.height &&
      observed.screenshotPath === expectedPath && /^[a-f0-9]{64}$/.test(String(observed.screenshotSha256 || "")) &&
      Number.isInteger(observed.h1Lines) && observed.h1Lines >= 1 && observed.h1Lines <= expected.maxH1Lines &&
      Number.isFinite(observed.h1ViewportRatio) && observed.h1ViewportRatio > 0 &&
      observed.h1ViewportRatio <= expected.maxH1ViewportRatio &&
      observed.ctaInFirstViewport === true &&
      Number.isFinite(observed.horizontalOverflowPx) && observed.horizontalOverflowPx >= 0 &&
      observed.horizontalOverflowPx <= policy.maxHorizontalOverflowPx &&
      observed.rawMarkdownVisible === false && observed.signatureVisible === true &&
      Number.isInteger(observed.maxUniformNumberedRun) && observed.maxUniformNumberedRun >= 0 &&
      observed.maxUniformNumberedRun <= policy.maxUniformNumberedRun;
  });
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
    hasRequiredChecks &&
    validateVisualAuditContract(input);
}

export function repositoryPublicationStage(publicationStatus) {
  return publicationStatus === "published" ? "repository_published" : null;
}
