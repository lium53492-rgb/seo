import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import seoPolicy from "@/data/config/seo-policy.json";
import productFactCatalog from "@/data/config/product-facts.json";
import type { PublishedSeoPage } from "./types";

const pagesDirectory = resolve(process.cwd(), "data/pages");
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const approvedFactIds = new Set(productFactCatalog.facts.map((fact) => fact.id));
const forbiddenClaims = productFactCatalog.forbiddenClaimPatterns.map((pattern) => new RegExp(pattern, "i"));

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function hasValidEditorialReview(page: Partial<PublishedSeoPage>) {
  const review = page.editorialReview;
  if (!review || review.decision !== "approved") return false;
  if (review.reportId !== page.generatedFromReport || review.slug !== page.slug) return false;
  if (!page.draftDigest || review.draftDigest !== page.draftDigest || !/^[a-f0-9]{64}$/.test(page.draftDigest)) return false;
  if (!["human", "codex_editor"].includes(review.reviewerType)) return false;
  if (!isNonEmptyString(review.reviewer) || review.reviewer.trim().length < 2 || !isNonEmptyString(review.notes) || review.notes.trim().length < 20) return false;
  if (!isValidTimestamp(review.reviewedAt) || !Array.isArray(review.checks)) return false;
  return seoPolicy.requiredReviewChecks.every((checkId) => {
    const check = review.checks.find((item) => item.id === checkId);
    return check?.passed === true && isNonEmptyString(check.detail) && check.detail.trim().length >= 10;
  });
}

function isPublishedPage(value: unknown): value is PublishedSeoPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<PublishedSeoPage>;
  const hasRequiredReview =
    page.schemaVersion === 1 ||
    (page.schemaVersion === 2 && hasValidEditorialReview(page));
  const sectionsAreValid = Array.isArray(page.sections) &&
    page.sections.length >= seoPolicy.content.minSections &&
    page.sections.every((section) => isNonEmptyString(section?.heading) && isNonEmptyString(section?.bodyMarkdown));
  const faqsAreValid = Array.isArray(page.faqs) &&
    page.faqs.length >= seoPolicy.content.minFaqs &&
    page.faqs.every((faq) => isNonEmptyString(faq?.question) && isNonEmptyString(faq?.answerMarkdown));
  const factsAreValid = Array.isArray(page.factIdsUsed) &&
    page.factIdsUsed.length >= 2 &&
    page.factIdsUsed.every((id) => typeof id === "string" && approvedFactIds.has(id));
  const linksAreValid = Array.isArray(page.internalLinks) && page.internalLinks.every((link) =>
    isNonEmptyString(link?.anchor) && typeof link?.href === "string" && (link.href === "/" || /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.href))
  );
  const publishableText = [
    page.title,
    page.metaDescription,
    page.h1,
    page.heroMarkdown,
    ...(Array.isArray(page.sections) ? page.sections.flatMap((section) => [section?.heading, section?.bodyMarkdown]) : []),
    ...(Array.isArray(page.faqs) ? page.faqs.flatMap((faq) => [faq?.question, faq?.answerMarkdown]) : []),
  ].filter((item): item is string => typeof item === "string").join(" ");
  return (
    (page.schemaVersion === 1 || page.schemaVersion === 2) &&
    hasRequiredReview &&
    page.status === "published" &&
    typeof page.slug === "string" &&
    safeSlug.test(page.slug) &&
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
    Boolean(page.quality?.passed)
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
