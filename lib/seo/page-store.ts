import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import seoPolicy from "@/data/config/seo-policy.json";
import type { PublishedSeoPage } from "./types";

const pagesDirectory = resolve(process.cwd(), "data/pages");
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function hasValidEditorialReview(page: Partial<PublishedSeoPage>) {
  const review = page.editorialReview;
  if (!review || review.decision !== "approved") return false;
  if (review.reportId !== page.generatedFromReport || review.slug !== page.slug) return false;
  if (!["human", "codex_editor"].includes(review.reviewerType)) return false;
  if (review.reviewer.trim().length < 2 || review.notes.trim().length < 20) return false;
  if (!Number.isFinite(Date.parse(review.reviewedAt)) || !Array.isArray(review.checks)) return false;
  return seoPolicy.requiredReviewChecks.every((checkId) => {
    const check = review.checks.find((item) => item.id === checkId);
    return check?.passed === true && check.detail.trim().length >= 10;
  });
}

function isPublishedPage(value: unknown): value is PublishedSeoPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<PublishedSeoPage>;
  const hasRequiredReview =
    page.schemaVersion === 1 ||
    (page.schemaVersion === 2 && hasValidEditorialReview(page));
  return (
    (page.schemaVersion === 1 || page.schemaVersion === 2) &&
    hasRequiredReview &&
    page.status === "published" &&
    typeof page.slug === "string" &&
    safeSlug.test(page.slug) &&
    page.path === `/${page.slug}` &&
    typeof page.title === "string" &&
    typeof page.h1 === "string" &&
    Array.isArray(page.sections) &&
    Array.isArray(page.faqs) &&
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
