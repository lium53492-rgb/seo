import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const reportPath = process.argv[2];
const reviewPath = process.argv[3];
if (!reportPath || !reviewPath) {
  throw new Error("Usage: npm run research:publish -- data/reports/YYYY-MM-DD.json data/reviews/YYYY-MM-DD.json");
}

const readJson = (path) => JSON.parse(readFileSync(resolve(path), "utf8"));
const report = readJson(reportPath);
const review = readJson(reviewPath);
const policy = readJson("data/config/seo-policy.json");
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

if (report.publication?.status !== "ready_for_review" || !report.draft?.quality?.passed) {
  throw new Error("Report does not contain a draft that passed automated gates");
}
if (review.schemaVersion !== 1 || review.reportId !== report.id || review.decision !== "approved") {
  throw new Error("Approval record must explicitly approve this report");
}
if (!safeSlug.test(review.slug) || review.slug !== report.publication.slug) {
  throw new Error("Approval slug must match the reviewed draft");
}
if (!["human", "codex_editor"].includes(review.reviewerType) || String(review.reviewer || "").trim().length < 2) {
  throw new Error("Approval record needs an identified human or Codex editor");
}
if (!Number.isFinite(Date.parse(review.reviewedAt)) || String(review.notes || "").trim().length < 20) {
  throw new Error("Approval record needs a timestamp and specific review notes");
}
const checks = Array.isArray(review.checks) ? review.checks : [];
for (const checkId of policy.requiredReviewChecks) {
  const check = checks.find((item) => item.id === checkId);
  if (!check || check.passed !== true || String(check.detail || "").trim().length < 10) {
    throw new Error(`Approval record is missing a passed ${checkId} check`);
  }
}

const pagesDirectory = resolve("data/pages");
const pages = existsSync(pagesDirectory)
  ? readdirSync(pagesDirectory).filter((name) => name.endsWith(".json")).map((name) => readJson(resolve(pagesDirectory, name))).filter((page) => page.status === "published")
  : [];
const sameSlug = pages.find((page) => page.slug === review.slug);
const sameReportPages = pages.filter((page) => page.generatedFromReport === report.id && page.slug !== review.slug);
if (sameReportPages.length >= policy.dailyPageLimit) {
  throw new Error(`Report ${report.id} already reached its ${policy.dailyPageLimit}-page publication limit`);
}
if (sameSlug && sameSlug.generatedFromReport !== report.id && report.publicationMode !== "update") {
  throw new Error(`Page /${review.slug} already exists and this report is not an update`);
}

const draft = report.draft;
const opportunity = report.opportunities.find((candidate) => candidate.keyword === draft.keyword);
if (!opportunity || !["create_page", "improve_page"].includes(opportunity.action)) {
  throw new Error("Reviewed draft no longer maps to a publishable opportunity");
}
const publishedAt = sameSlug?.publishedAt || review.reviewedAt;
const page = {
  schemaVersion: 2,
  status: "published",
  slug: review.slug,
  path: `/${review.slug}`,
  keyword: opportunity.keyword,
  publishedAt,
  updatedAt: review.reviewedAt,
  generatedFromReport: report.id,
  pagePattern: report.contentStrategy.pagePattern,
  title: draft.title,
  metaDescription: draft.metaDescription,
  h1: draft.h1,
  heroMarkdown: draft.heroMarkdown,
  primaryCta: draft.primaryCta,
  sections: draft.sections,
  faqs: draft.faqs,
  factIdsUsed: draft.factIdsUsed,
  internalLinks: draft.internalLinks || [],
  assetBriefs: draft.assetBriefs || [],
  quality: draft.quality,
  editorialReview: review,
  research: {
    opportunityScore: opportunity.score,
    demandProxy: opportunity.demandScore || 0,
    competitionProxy: opportunity.difficulty,
    evidenceCount: report.evidence?.length || 0,
    trialIntent: opportunity.trialIntent,
    revenueIntent: opportunity.revenueIntent,
    intentSpecificity: opportunity.intentSpecificity,
    funnelStage: opportunity.funnelStage,
    conversionGoal: opportunity.conversionGoal,
  },
};

const pagePath = resolve(`data/pages/${review.slug}.json`);
mkdirSync(dirname(pagePath), { recursive: true });
writeFileSync(pagePath, `${JSON.stringify(page, null, 2)}\n`, "utf8");

const publication = {
  status: "published",
  slug: review.slug,
  path: `/${review.slug}`,
  slot: "morning",
  publishedAt,
  reason: `Approved by ${review.reviewerType} ${review.reviewer} after automated and editorial gates passed.`,
};
report.publication = publication;
report.publications = [publication];
report.actions = report.actions.map((action) => action.priority === "P2"
  ? { ...action, action: `Build and publish /${review.slug}`, why: publication.reason, expectedImpact: "Release one reviewed, measurable page." }
  : action);
report.caveats = [...new Set([...(report.caveats || []), "Publication required a separate editorial approval artifact."])];
writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${pagePath}\n`);
