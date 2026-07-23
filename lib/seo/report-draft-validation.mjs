function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(isString);
}

function isFiniteMetric(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isReportDraft(value, { allowLegacyMetadata = false } = {}) {
  if (value === null) return true;
  if (!isRecord(value)) return false;

  const hasCurrentMetadata =
    isString(value.slug) &&
    isString(value.model) &&
    isString(value.generatedAt) &&
    Number.isFinite(Date.parse(value.generatedAt));
  if (!allowLegacyMetadata && !hasCurrentMetadata) return false;

  return isString(value.keyword) &&
    value.language === "en" &&
    (value.status === "ready_for_review" || value.status === "blocked") &&
    value.reviewRequired === true &&
    isString(value.title) &&
    isString(value.metaDescription) &&
    isString(value.h1) &&
    isString(value.heroMarkdown) &&
    isString(value.primaryCta) &&
    Array.isArray(value.sections) &&
    value.sections.every((section) =>
      isRecord(section) && isString(section.heading) && isString(section.bodyMarkdown)) &&
    Array.isArray(value.faqs) &&
    value.faqs.every((faq) =>
      isRecord(faq) && isString(faq.question) && isString(faq.answerMarkdown)) &&
    isStringArray(value.factIdsUsed) &&
    Array.isArray(value.internalLinks) &&
    value.internalLinks.every((link) =>
      isRecord(link) && isString(link.anchor) && isString(link.href)) &&
    isStringArray(value.assetBriefs) &&
    isRecord(value.quality) &&
    typeof value.quality.passed === "boolean" &&
    isFiniteMetric(value.quality.wordCount) &&
    Array.isArray(value.quality.checks) &&
    value.quality.checks.every((check) =>
      isRecord(check) &&
      isString(check.id) &&
      isString(check.label) &&
      typeof check.passed === "boolean" &&
      isString(check.detail));
}
