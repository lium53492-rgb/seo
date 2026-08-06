import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import seoPolicy from "../../data/config/seo-policy.json" with { type: "json" };
import architecturePolicy from "../../data/config/content-architecture.json" with { type: "json" };
import { validatePipelineReviewContract } from "../../lib/seo/pipeline-contract.mjs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function shanghaiDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Daily run date is invalid");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Daily artifact is not valid JSON: ${path}`, { cause: error });
  }
}

function publicationSlug(report) {
  const publication = report?.publication;
  return publication?.status === "published" && typeof publication.slug === "string"
    ? publication.slug.replace(/^\//, "")
    : null;
}

function normalizedSlug(value) {
  return typeof value === "string" ? value.replace(/^\//, "") : null;
}

function pagePublishedOn(page, date) {
  return page?.status === "published" && typeof page.publishedAt === "string" &&
    shanghaiDate(page.publishedAt) === date;
}

export function deriveDailyRunState({
  date,
  growth = null,
  research = null,
  report = null,
  review = null,
  pages = [],
  pdfExists = false,
}) {
  if (!DATE_PATTERN.test(String(date || ""))) throw new Error("Daily state requires YYYY-MM-DD");
  const todayPages = pages.filter((page) => pagePublishedOn(page, date));
  const reportedSlug = publicationSlug(report);
  const draftSlug = normalizedSlug(report?.draft?.slug);
  const publicationDraftSlug = normalizedSlug(report?.publication?.slug);
  const reviewedSlug = normalizedSlug(review?.slug);
  const draftSchemaVersion = typeof report?.draft?.schemaVersion === "number"
    ? report.draft.schemaVersion
    : null;
  const reviewContractValid = Boolean(review && report && validatePipelineReviewContract({
    review,
    reportId: typeof report.id === "string" ? report.id : null,
    expectedSlug: publicationDraftSlug ?? draftSlug,
    expectedDigest: typeof report.publication?.draftDigest === "string"
      ? report.publication.draftDigest
      : null,
    reportGeneratedAt: typeof report.generatedAt === "string" ? report.generatedAt : null,
    draftSchemaVersion,
    requiredDraftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
    baseRequiredChecks: seoPolicy.requiredReviewChecks,
    architectureRequiredChecks: architecturePolicy.requiredReviewChecks,
  }));
  const reportReadyForPublication = report?.publication?.status === "ready_for_review" &&
    report?.draft?.quality?.passed === true;
  const todayPage = todayPages[0] ?? null;
  const pageMatchesApprovedChain = Boolean(todayPage && report && reviewContractValid &&
    todayPage.generatedFromReport === report.id &&
    todayPage.slug === reviewedSlug &&
    todayPage.draftDigest === review.draftDigest &&
    todayPage.editorialReview?.reportId === review.reportId &&
    todayPage.editorialReview?.draftDigest === review.draftDigest &&
    todayPage.editorialReview?.decision === "approved");
  const publicationNeedsFinalization = Boolean(pageMatchesApprovedChain &&
    report?.publication?.status === "ready_for_review" &&
    publicationDraftSlug === todayPage?.slug);
  const conflicts = [];

  if (todayPages.length > 1) conflicts.push("More than one page is published for the Shanghai day.");
  if (research && !growth) conflicts.push("Research exists without the required growth snapshot.");
  if (report && !research) conflicts.push("A report exists without its research input.");
  if (review && !report) conflicts.push("A review exists without its report.");
  if (pdfExists && todayPages.length === 0) conflicts.push("A PDF exists before today's page publication.");
  if (research?.date && research.date !== date) conflicts.push("The research date does not match the daily chain.");
  if (report?.date && report.date !== date) conflicts.push("The report date does not match the daily chain.");
  if (report && date >= seoPolicy.contentArchitecture.enforcedFromReportDate &&
    draftSchemaVersion !== architecturePolicy.requiredDraftSchemaVersion) {
    conflicts.push("The daily report does not contain the required architecture draft schema.");
  }
  if (review?.reviewedAt && shanghaiDate(review.reviewedAt) !== date) {
    conflicts.push("The review timestamp does not belong to the Shanghai day.");
  }
  if (review && report?.id && review.reportId !== report.id) {
    conflicts.push("The review reportId does not match the daily report.");
  }
  if (review && report?.generatedAt && Date.parse(review.reviewedAt) < Date.parse(report.generatedAt)) {
    conflicts.push("The review predates the generated report.");
  }
  if (review && report?.publication?.draftDigest && review.draftDigest !== report.publication.draftDigest) {
    conflicts.push("The review digest does not match the report draft.");
  }
  if (review?.decision === "approved" && !reviewContractValid) {
    conflicts.push("The approved review does not satisfy the complete editorial contract.");
  }
  if (reviewContractValid && !reportReadyForPublication && report?.publication?.status !== "published") {
    conflicts.push("An approved review is attached to a report that is not ready for publication.");
  }
  if (reportedSlug && !todayPages.some((page) => page.slug === reportedSlug)) {
    conflicts.push("The report claims publication but the matching page is not published today.");
  }
  if (todayPages.length === 1 && !publicationNeedsFinalization &&
    (!reportedSlug || reportedSlug !== todayPages[0].slug)) {
    conflicts.push("Today's page is not bound to the report publication record.");
  }
  if (todayPages.length === 1 && !pageMatchesApprovedChain) {
    conflicts.push("Today's page is not bound to the valid approved review and report digest.");
  }
  if (reviewedSlug && draftSlug && reviewedSlug !== draftSlug) {
    conflicts.push("The review slug does not match the report draft.");
  }
  if (publicationDraftSlug && draftSlug && publicationDraftSlug !== draftSlug) {
    conflicts.push("The publication slug does not match the report draft.");
  }

  if (conflicts.length > 0) {
    return {
      schemaVersion: 1,
      date,
      state: "conflict",
      resumeAt: null,
      mayCreatePage: false,
      publishedSlug: todayPages[0]?.slug ?? null,
      conflicts,
    };
  }

  let state = "start";
  let resumeAt = "growth_check";
  if (publicationNeedsFinalization) {
    state = "resume_publish";
    resumeAt = "publish";
  } else if (todayPages.length === 1) {
    state = pdfExists ? "local_publication_complete" : "resume_after_publication";
    resumeAt = pdfExists ? "release_verification" : "pdf";
  } else if (reviewContractValid && reportReadyForPublication) {
    state = "resume_publish";
    resumeAt = "publish";
  } else if (report) {
    state = "resume_review";
    resumeAt = "review";
  } else if (research) {
    state = "resume_build";
    resumeAt = "build";
  } else if (growth) {
    state = "resume_research";
    resumeAt = "research";
  }

  return {
    schemaVersion: 1,
    date,
    state,
    resumeAt,
    mayCreatePage: todayPages.length === 0,
    publishedSlug: todayPages[0]?.slug ?? null,
    conflicts: [],
  };
}

export function readDailyRunState({ root = process.cwd(), date = shanghaiDate() } = {}) {
  const artifact = (folder) => readJson(resolve(root, `data/${folder}/${date}.json`));
  const pagesDirectory = resolve(root, "data/pages");
  const pages = existsSync(pagesDirectory)
    ? readdirSync(pagesDirectory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson(resolve(pagesDirectory, name)))
    : [];
  return deriveDailyRunState({
    date,
    growth: artifact("growth"),
    research: artifact("research"),
    report: artifact("reports"),
    review: artifact("reviews"),
    pages,
    pdfExists: existsSync(resolve(root, `output/pdf/seo-daily-${date}.pdf`)),
  });
}
