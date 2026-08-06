import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { validatePageArchitecture, validateSeoArchitectureBridge } from "../lib/seo/content-contract.mjs";
import {
  analyzeContentNovelty,
  visiblePageText,
} from "../lib/seo/content-similarity.mjs";
import { publishedArchitectureHistoryFromReports } from "../lib/seo/content-history.mjs";
import { servedContentDigest } from "../lib/seo/served-content.mjs";

const reportPath = process.argv[2];
const reviewPath = process.argv[3];
if (!reportPath || !reviewPath) {
  throw new Error("Usage: npm run research:publish -- data/reports/YYYY-MM-DD.json data/reviews/YYYY-MM-DD.json");
}

const readJson = (path) => JSON.parse(readFileSync(resolve(path), "utf8"));
const report = readJson(reportPath);
const review = readJson(reviewPath);
const policy = readJson("data/config/seo-policy.json");
const factCatalog = readJson("data/config/product-facts.json");
const architecturePolicy = readJson("data/config/content-architecture.json");
const presentationCatalog = readJson("data/config/presentation-recipes.json");
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

validateSeoArchitectureBridge(policy, architecturePolicy);

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

function shanghaiDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

if (report.publication?.status !== "ready_for_review" || !report.draft?.quality?.passed) {
  throw new Error("Report does not contain a draft that passed automated gates");
}
if (review.schemaVersion !== 1 || review.reportId !== report.id || review.decision !== "approved") {
  throw new Error("Approval record must explicitly approve this report");
}
if (!safeSlug.test(review.slug) || review.slug !== report.publication.slug) {
  throw new Error("Approval slug must match the reviewed draft");
}
const draftDigest = report.draft?.schemaVersion === architecturePolicy.requiredDraftSchemaVersion
  ? sha256({ draft: report.draft, contentStrategy: report.contentStrategy })
  : sha256(report.draft);
if (!/^[a-f0-9]{64}$/.test(report.publication.draftDigest || "") ||
  review.draftDigest !== report.publication.draftDigest ||
  draftDigest !== report.publication.draftDigest) {
  throw new Error("Approval must match the exact SHA-256 digest of the reviewed draft");
}
if (!["human", "codex_editor"].includes(review.reviewerType) || String(review.reviewer || "").trim().length < 2) {
  throw new Error("Approval record needs an identified human or Codex editor");
}
if (!Number.isFinite(Date.parse(review.reviewedAt)) || String(review.notes || "").trim().length < 20) {
  throw new Error("Approval record needs a timestamp and specific review notes");
}
if (!Number.isFinite(Date.parse(report.generatedAt)) || Date.parse(review.reviewedAt) < Date.parse(report.generatedAt)) {
  throw new Error("Approval timestamp must be after report generation");
}
const checks = Array.isArray(review.checks) ? review.checks : [];
const requiredReviewChecks = report.draft?.schemaVersion === architecturePolicy.requiredDraftSchemaVersion
  ? [...policy.requiredReviewChecks, ...architecturePolicy.requiredReviewChecks]
  : policy.requiredReviewChecks;
for (const checkId of requiredReviewChecks) {
  const check = checks.find((item) => item.id === checkId);
  if (!check || check.passed !== true || String(check.detail || "").trim().length < 10) {
    throw new Error(`Approval record is missing a passed ${checkId} check`);
  }
}

const pagesDirectory = resolve("data/pages");
const pages = existsSync(pagesDirectory)
  ? readdirSync(pagesDirectory).filter((name) => name.endsWith(".json")).map((name) => readJson(resolve(pagesDirectory, name))).filter((page) => page.status === "published")
  : [];
const reportsDirectory = resolve("data/reports");
const architectureHistory = publishedArchitectureHistoryFromReports(
  existsSync(reportsDirectory)
    ? readdirSync(reportsDirectory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson(resolve(reportsDirectory, name)))
    : [],
);
const sameSlug = pages.find((page) => page.slug === review.slug);
const sameReportPages = pages.filter((page) => page.generatedFromReport === report.id && page.slug !== review.slug);
const sameDayPages = pages.filter((page) => page.slug !== review.slug && shanghaiDate(page.publishedAt) === report.date);
if (sameReportPages.length >= policy.dailyPageLimit) {
  throw new Error(`Report ${report.id} already reached its ${policy.dailyPageLimit}-page publication limit`);
}
if (sameDayPages.length >= policy.dailyPageLimit) {
  throw new Error(`${report.date} already reached its ${policy.dailyPageLimit}-page publication limit`);
}
if (sameSlug && sameSlug.generatedFromReport !== report.id && report.publicationMode !== "update") {
  throw new Error(`Page /${review.slug} already exists and this report is not an update`);
}

const draft = report.draft;
const opportunity = report.opportunities.find((candidate) => candidate.keyword === draft.keyword);
const expectedAction = report.publicationMode === "update" ? "improve_page" : "create_page";
if (!opportunity || opportunity.action !== expectedAction) {
  throw new Error("Reviewed draft no longer maps to a publishable opportunity");
}
if (!report.contentStrategy || !policy.allowedPagePatterns.includes(report.contentStrategy.pagePattern)) {
  throw new Error("Reviewed draft no longer has an approved page pattern");
}
const comparisonPages = pages.filter((page) => page.slug !== review.slug);
const reviewedInternalHrefs = (draft.internalLinks || []).map((link) => link.href);
if (new Set(reviewedInternalHrefs).size !== reviewedInternalHrefs.length) {
  throw new Error("Reviewed draft internal link targets must be unique");
}
if ((draft.internalLinks || []).some((link) => link.href === `/${review.slug}`)) {
  throw new Error("Reviewed draft cannot use its own route as a contextual internal link");
}
validatePageArchitecture({
  draft,
  contentStrategy: report.contentStrategy,
  candidate: opportunity,
  pages: comparisonPages,
  architecturePolicy,
  presentationCatalog,
});
const novelty = analyzeContentNovelty({
  draft,
  pages,
  architectureHistory,
  architecturePolicy,
  presentationCatalog,
  allowedPhrases: factCatalog.facts.map((fact) => fact.statement),
});
if (!novelty.passed) {
  const first = novelty.violations[0];
  throw new Error(`Content distinctness changed after review [${first.code}]: ${first.detail}`);
}
const approvedFactIds = new Set(factCatalog.facts.map((fact) => fact.id));
if (!Array.isArray(draft.factIdsUsed) || new Set(draft.factIdsUsed).size < 2 ||
  new Set(draft.factIdsUsed).size !== draft.factIdsUsed.length ||
  draft.factIdsUsed.some((id) => !approvedFactIds.has(id))) {
  throw new Error("Reviewed draft uses an unapproved or missing product fact ID");
}
const publishableText = visiblePageText(draft);
const failedClaim = factCatalog.forbiddenClaimPatterns
  .map((pattern) => new RegExp(pattern, "i"))
  .find((pattern) => pattern.test(publishableText));
if (failedClaim) throw new Error(`Reviewed draft contains an unsupported product claim: ${failedClaim}`);
const wordCount = (publishableText.match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
if (wordCount < policy.content.minWords || wordCount > policy.content.maxWords ||
  draft.sections.length < policy.content.minSections || draft.faqs.length < policy.content.minFaqs) {
  throw new Error("Reviewed draft no longer passes the content depth gate");
}
const publishedAt = sameSlug?.publishedAt || review.reviewedAt;
const page = {
  schemaVersion: policy.contentArchitecture.publishedPageSchemaVersion,
  status: "published",
  slug: review.slug,
  path: `/${review.slug}`,
  keyword: opportunity.keyword,
  publishedAt,
  updatedAt: review.reviewedAt,
  generatedFromReport: report.id,
  draftDigest,
  pagePattern: report.contentStrategy.pagePattern,
  architecture: draft.architecture,
  signatureModule: draft.signatureModule,
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
  quality: { ...draft.quality, novelty },
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
    ...(opportunity.scoreBasis ? { scoreBasis: opportunity.scoreBasis } : {}),
    ...(opportunity.decisionEvidence
      ? {
          evidenceRefs: opportunity.decisionEvidence.evidenceRefs,
          productFactIds: opportunity.decisionEvidence.productFactIds,
        }
      : {}),
  },
};
page.servedContentDigest = servedContentDigest(page);

const pagePath = resolve(`data/pages/${review.slug}.json`);
mkdirSync(dirname(pagePath), { recursive: true });
writeJsonAtomic(pagePath, page);

const publication = {
  status: "published",
  slug: review.slug,
  path: `/${review.slug}`,
  slot: "morning",
  publishedAt,
  updatedAt: review.reviewedAt,
  draftDigest,
  reason: `Approved by ${review.reviewerType} ${review.reviewer} after automated and editorial gates passed.`,
};
report.publication = publication;
report.publications = [publication];
report.actions = report.actions.map((action) => action.priority === "P2"
  ? { ...action, action: `Build and publish /${review.slug}`, why: publication.reason, expectedImpact: "Release one reviewed, measurable page." }
  : action);
report.caveats = [...new Set([...(report.caveats || []), "Publication required a separate editorial approval artifact."])];
writeJsonAtomic(resolve(reportPath), report);
process.stdout.write(`${pagePath}\n`);
