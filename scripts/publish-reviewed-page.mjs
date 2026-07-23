import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
const factCatalog = readJson("data/config/product-facts.json");
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
const draftDigest = sha256(report.draft);
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
const approvedFactIds = new Set(factCatalog.facts.map((fact) => fact.id));
if (!Array.isArray(draft.factIdsUsed) || draft.factIdsUsed.length < 2 || draft.factIdsUsed.some((id) => !approvedFactIds.has(id))) {
  throw new Error("Reviewed draft uses an unapproved or missing product fact ID");
}
const publishableText = [
  draft.title,
  draft.metaDescription,
  draft.h1,
  draft.heroMarkdown,
  ...draft.sections.flatMap((section) => [section.heading, section.bodyMarkdown]),
  ...draft.faqs.flatMap((faq) => [faq.question, faq.answerMarkdown]),
].join(" ");
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
  schemaVersion: 2,
  status: "published",
  slug: review.slug,
  path: `/${review.slug}`,
  keyword: opportunity.keyword,
  publishedAt,
  updatedAt: review.reviewedAt,
  generatedFromReport: report.id,
  draftDigest,
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
    ...(opportunity.scoreBasis ? { scoreBasis: opportunity.scoreBasis } : {}),
    ...(opportunity.decisionEvidence
      ? {
          evidenceRefs: opportunity.decisionEvidence.evidenceRefs,
          productFactIds: opportunity.decisionEvidence.productFactIds,
        }
      : {}),
  },
};

const pagePath = resolve(`data/pages/${review.slug}.json`);
mkdirSync(dirname(pagePath), { recursive: true });
writeJsonAtomic(pagePath, page);

const publication = {
  status: "published",
  slug: review.slug,
  path: `/${review.slug}`,
  slot: "morning",
  publishedAt,
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
