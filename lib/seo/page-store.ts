import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import seoPolicy from "@/data/config/seo-policy.json";
import productFactCatalog from "@/data/config/product-facts.json";
import architecturePolicy from "@/data/config/content-architecture.json";
import presentationCatalog from "@/data/config/presentation-recipes.json";
import {
  validatePublishedPageArchitecture,
  validatePresentationRecipeCatalog,
  validateSeoArchitectureBridge,
} from "./content-contract.mjs";
import { visiblePageText } from "./content-similarity.mjs";
import { markdownSemanticBlockCount } from "./markdown-semantics.mjs";
import { servedContentDigest } from "./served-content.mjs";
import { validateVisualAuditContract } from "./pipeline-contract.mjs";
import { audienceDraftBlockers } from "./audience-policy.mjs";
import { originalIpBoundaryBlockers } from "./ip-boundary.mjs";
import type { PublishedSeoPage } from "./types";

const pagesDirectory = resolve(process.cwd(), "data/pages");
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const approvedFactIds = new Set(productFactCatalog.facts.map((fact) => fact.id));
const forbiddenClaims = productFactCatalog.forbiddenClaimPatterns.map((pattern) => new RegExp(pattern, "i"));
const retiredPageSlugs = new Set(seoPolicy.retiredPageSlugs || []);
const retiredRecipeIds = new Set(seoPolicy.retiredRecipeIds || []);
const retiredPaletteIds = new Set(seoPolicy.retiredPaletteIds || []);
const legacyGrandfathering = seoPolicy.legacyPageGrandfathering;
const legacyPublishedBefore = Date.parse(legacyGrandfathering?.publishedBefore || "");
const legacyPageAllowlist = new Map(
  (legacyGrandfathering?.allowlist || []).map((entry) => [entry.slug, entry]),
);

if (!Number.isFinite(legacyPublishedBefore) ||
  legacyPageAllowlist.size !== (legacyGrandfathering?.allowlist || []).length ||
  [...legacyPageAllowlist.values()].some((entry) =>
    !safeSlug.test(entry.slug) ||
    !seoPolicy.contentArchitecture.legacyPageSchemas.includes(entry.schemaVersion) ||
    !isValidTimestamp(entry.publishedAt) ||
    Date.parse(entry.publishedAt) >= legacyPublishedBefore ||
    !isNonEmptyString(entry.generatedFromReport) ||
    !/^[a-f0-9]{64}$/.test(entry.draftDigest) ||
    !/^[a-f0-9]{64}$/.test(entry.servedContentDigest))) {
  throw new Error("SEO policy has an invalid legacy-page grandfathering contract");
}

validatePresentationRecipeCatalog(presentationCatalog, architecturePolicy);
validateSeoArchitectureBridge(seoPolicy, architecturePolicy);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isGrandfatheredLegacyPage(page: Partial<PublishedSeoPage>) {
  const entry = typeof page.slug === "string" ? legacyPageAllowlist.get(page.slug) : null;
  return Boolean(entry &&
    page.schemaVersion === entry.schemaVersion &&
    page.publishedAt === entry.publishedAt &&
    Date.parse(page.publishedAt) < legacyPublishedBefore &&
    page.generatedFromReport === entry.generatedFromReport &&
    page.draftDigest === entry.draftDigest &&
    servedContentDigest(page as Record<string, unknown>) === entry.servedContentDigest);
}

function hasValidEditorialReview(page: Partial<PublishedSeoPage>) {
  const review = page.editorialReview;
  if (!review || review.decision !== "approved") return false;
  if (review.reportId !== page.generatedFromReport || review.slug !== page.slug) return false;
  if (!page.draftDigest || review.draftDigest !== page.draftDigest || !/^[a-f0-9]{64}$/.test(page.draftDigest)) return false;
  if (!["human", "codex_editor"].includes(review.reviewerType)) return false;
  if (!isNonEmptyString(review.reviewer) || review.reviewer.trim().length < 2 || !isNonEmptyString(review.notes) || review.notes.trim().length < 20) return false;
  if (!isValidTimestamp(review.reviewedAt) || !Array.isArray(review.checks)) return false;
  const requiredChecks = page.schemaVersion === seoPolicy.contentArchitecture.publishedPageSchemaVersion
    ? [...seoPolicy.requiredReviewChecks, ...architecturePolicy.requiredReviewChecks]
    : seoPolicy.requiredReviewChecks;
  const checksValid = requiredChecks.every((checkId) => {
    const check = review.checks.find((item) => item.id === checkId);
    return check?.passed === true && isNonEmptyString(check.detail) && check.detail.trim().length >= 10;
  });
  return checksValid && validateVisualAuditContract({
    review,
    reportId: page.generatedFromReport,
    reportDate: String(page.generatedFromReport || "").match(/\d{4}-\d{2}-\d{2}/)?.[0],
    expectedSlug: page.slug,
    expectedDigest: page.draftDigest,
    reportGeneratedAt: "1970-01-01T00:00:00.000Z",
    draftSchemaVersion: page.schemaVersion === seoPolicy.contentArchitecture.publishedPageSchemaVersion
      ? architecturePolicy.requiredDraftSchemaVersion
      : null,
    requiredDraftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
    visualAuditPolicy: seoPolicy.visualAudit,
  });
}

function englishWordCount(value: unknown) {
  return (String(value || "").match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
}

function hasValidArchitecture(page: Partial<PublishedSeoPage>) {
  if (page.schemaVersion !== seoPolicy.contentArchitecture.publishedPageSchemaVersion) return true;
  try {
    validatePublishedPageArchitecture({
      page: page as Record<string, unknown>,
      architecturePolicy,
      presentationCatalog,
    });
    return true;
  } catch {
    return false;
  }
}

function isPublishedPage(value: unknown): value is PublishedSeoPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<PublishedSeoPage>;
  const isCurrentSchema = page.schemaVersion === seoPolicy.contentArchitecture.publishedPageSchemaVersion;
  const isSupportedSchema = isCurrentSchema || isGrandfatheredLegacyPage(page);
  const hasRequiredReview =
    page.schemaVersion === 1 ||
    ((page.schemaVersion === 2 || isCurrentSchema) && hasValidEditorialReview(page));
  const sectionsAreValid = Array.isArray(page.sections) &&
    page.sections.length >= seoPolicy.content.minSections &&
    page.sections.every((section) => isNonEmptyString(section?.heading) && isNonEmptyString(section?.bodyMarkdown) &&
      (!isCurrentSchema || (isNonEmptyString(section?.id) && isNonEmptyString(section?.role) && isNonEmptyString(section?.format) &&
        englishWordCount(section.bodyMarkdown) >= architecturePolicy.minimumSectionBodyWords &&
        (!["steps", "checklist", "examples", "comparison"].includes(section.format) ||
          markdownSemanticBlockCount(section.bodyMarkdown) >= 2))));
  const faqsAreValid = Array.isArray(page.faqs) &&
    page.faqs.length >= seoPolicy.content.minFaqs &&
    page.faqs.every((faq) => isNonEmptyString(faq?.question) && isNonEmptyString(faq?.answerMarkdown) &&
      (!isCurrentSchema || (isNonEmptyString(faq?.id) && isNonEmptyString(faq?.job) &&
        englishWordCount(faq.answerMarkdown) >= architecturePolicy.minimumFaqAnswerWords)));
  const factsAreValid = Array.isArray(page.factIdsUsed) &&
    new Set(page.factIdsUsed).size >= 2 &&
    new Set(page.factIdsUsed).size === page.factIdsUsed.length &&
    page.factIdsUsed.every((id) => typeof id === "string" && approvedFactIds.has(id));
  const linksAreValid = Array.isArray(page.internalLinks) && page.internalLinks.every((link) =>
    isNonEmptyString(link?.anchor) && typeof link?.href === "string" && link.href !== page.path &&
    (link.href === "/" || /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.href))
  ) && new Set(page.internalLinks.map((link) => link.href)).size === page.internalLinks.length;
  const publishableText = visiblePageText(page as Record<string, unknown>);
  const currentSchemaReportDate = String(page.generatedFromReport || "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const currentSchemaPolicyDateIsValid = !isCurrentSchema || Boolean(
    currentSchemaReportDate &&
    currentSchemaReportDate >= seoPolicy.audienceStrategy.enforcedFromReportDate &&
    currentSchemaReportDate >= seoPolicy.ipBoundary.enforcedFromReportDate
  );
  const publishableWordCount = (publishableText.match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
  const runtimeDigestIsValid = !isCurrentSchema || (
    isNonEmptyString(page.servedContentDigest) &&
    /^[a-f0-9]{64}$/.test(page.servedContentDigest) &&
    servedContentDigest(page as Record<string, unknown>) === page.servedContentDigest
  );
  const audienceContractIsValid = !isCurrentSchema || audienceDraftBlockers({
    policy: seoPolicy,
    reportDate: currentSchemaReportDate,
    keyword: page.keyword,
    h1: page.h1,
    factIds: page.factIdsUsed,
    architecture: page.architecture,
    visibleText: `${page.keyword || ""} ${publishableText}`,
  }).length === 0;
  const originalIpBoundaryIsValid = !isCurrentSchema || originalIpBoundaryBlockers({
    policy: seoPolicy,
    reportDate: currentSchemaReportDate,
    draftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
    ipBoundary: page.ipBoundary,
    visibleText: publishableText,
  }).length === 0;
  return (
    isSupportedSchema &&
    hasRequiredReview &&
    hasValidArchitecture(page) &&
    currentSchemaPolicyDateIsValid &&
    audienceContractIsValid &&
    originalIpBoundaryIsValid &&
    runtimeDigestIsValid &&
    page.status === "published" &&
    typeof page.slug === "string" &&
    safeSlug.test(page.slug) &&
    !retiredPageSlugs.has(page.slug) &&
    page.path === `/${page.slug}` &&
    isNonEmptyString(page.keyword) &&
    isNonEmptyString(page.generatedFromReport) &&
    isValidTimestamp(page.publishedAt) &&
    isValidTimestamp(page.updatedAt) &&
    Date.parse(page.updatedAt) >= Date.parse(page.publishedAt) &&
    isNonEmptyString(page.title) &&
    isNonEmptyString(page.metaDescription) &&
    isNonEmptyString(page.h1) &&
    isNonEmptyString(page.heroMarkdown) &&
    isNonEmptyString(page.primaryCta) &&
    sectionsAreValid &&
    faqsAreValid &&
    factsAreValid &&
    linksAreValid &&
    (!page.pagePattern || seoPolicy.allowedPagePatterns.includes(page.pagePattern)) &&
    !forbiddenClaims.some((pattern) => pattern.test(publishableText)) &&
    (!isCurrentSchema || (!retiredRecipeIds.has(page.architecture?.presentation.recipeId ?? "") &&
      !retiredPaletteIds.has(page.architecture?.presentation.paletteId ?? "") &&
      publishableWordCount >= seoPolicy.content.minWords &&
      publishableWordCount <= seoPolicy.content.maxWords && page.quality?.wordCount === publishableWordCount)) &&
    page.quality?.passed === true
  );
}

export async function listPublishedPages(): Promise<PublishedSeoPage[]> {
  try {
    const files = (await readdir(pagesDirectory))
      .filter((name) => safeSlug.test(name.replace(/\.json$/, "")) && name.endsWith(".json"))
      .sort();
    const pages = await Promise.all(
      files.map(async (name) => {
        const value = JSON.parse(
          await readFile(resolve(pagesDirectory, name), "utf8"),
        ) as unknown;
        return isPublishedPage(value) ? value : null;
      }),
    );
    return pages
      .filter((page): page is PublishedSeoPage => Boolean(page))
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function readPublishedPage(slug: string) {
  if (!safeSlug.test(slug)) return null;
  try {
    const value = JSON.parse(
      await readFile(resolve(pagesDirectory, `${slug}.json`), "utf8"),
    ) as unknown;
    return isPublishedPage(value) ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
