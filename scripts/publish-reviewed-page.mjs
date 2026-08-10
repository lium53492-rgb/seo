import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { validatePageArchitecture, validateSeoArchitectureBridge } from "../lib/seo/content-contract.mjs";
import {
  analyzeContentNovelty,
  visiblePageText,
} from "../lib/seo/content-similarity.mjs";
import { publishedArchitectureHistoryFromReports } from "../lib/seo/content-history.mjs";
import { servedContentDigest } from "../lib/seo/served-content.mjs";
import { validatePipelineReviewContract } from "../lib/seo/pipeline-contract.mjs";
import {
  coordinationOwner,
  withDailyPublicationGuard,
} from "./lib/daily-coordination.mjs";

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
const unattendedPolicy = readJson("data/config/unattended-publishing.json");
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const retiredPageSlugs = new Set(Array.isArray(policy.retiredPageSlugs) ? policy.retiredPageSlugs : []);

validateSeoArchitectureBridge(policy, architecturePolicy);

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(temporaryPath, path);
        break;
      } catch (error) {
        if (!["EACCES", "EBUSY", "EPERM"].includes(error?.code) || attempt >= 24) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(20 + attempt * 5, 100));
      }
    }
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function shanghaiDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function isOfficialObservedTrendSignal(signal, reportDate, selectedKeyword) {
  let sourceUrl;
  try {
    sourceUrl = new URL(signal?.sourceUrl);
  } catch {
    return false;
  }
  let collectedDate;
  try {
    collectedDate = shanghaiDate(signal?.collectedAt);
  } catch {
    return false;
  }
  return String(signal?.keyword || "").trim().toLowerCase() === selectedKeyword &&
    signal?.source === "google_trends" &&
    signal?.state === "observed" &&
    sourceUrl.protocol === "https:" &&
    !sourceUrl.username &&
    !sourceUrl.password &&
    sourceUrl.hostname === "trends.google.com" &&
    sourceUrl.pathname.startsWith("/trends/") &&
    collectedDate === reportDate &&
    Number.isInteger(signal?.relativeInterest) &&
    signal.relativeInterest >= 0 &&
    signal.relativeInterest <= 100 &&
    (signal.direction === "rising" || signal.relativeInterest >= 50);
}

function assertCreatePagePublicationReadiness(candidateReport) {
  if (candidateReport.publicationMode === "update") return;
  if (candidateReport.portfolioDecision?.action !== "create_page") {
    throw new Error("Create-page publication requires portfolioDecision.action=create_page");
  }
  if (unattendedPolicy.allowCreatePageWhenMetricsUnavailable !== false) {
    throw new Error("Create-page growth readiness gate requires allowCreatePageWhenMetricsUnavailable=false");
  }
  const portfolio = candidateReport.portfolioFunnels;
  const summary = portfolio?.summary;
  const entries = Array.isArray(portfolio?.entries) ? portfolio.entries : [];
  const pageReadinessFailures = entries.filter((entry) =>
    entry?.state !== "collected" ||
    entry.report?.decisionState?.searchPerformanceReady !== true ||
    entry.report?.decisionState?.landingUvReady !== true ||
    entry.report?.decisionState?.qualifiedOutboundReady !== true);
  const growthReady = Boolean(summary) &&
    summary.collectedPages === summary.publishedPages &&
    summary.unavailablePages === 0 &&
    summary.attributionJoinReady === true &&
    entries.length === summary.publishedPages &&
    pageReadinessFailures.length === 0;
  if (!growthReady) {
    throw new Error(
      "Create-page growth readiness gate failed: every published page must be collected with " +
      "Search Console, landing UV, and qualified outbound readiness, zero unavailable pages, " +
      "and attributionJoinReady=true",
    );
  }
  const selectedKeyword = String(candidateReport.draft?.keyword || "").trim().toLowerCase();
  const trendReady = Array.isArray(candidateReport.trendSignals) &&
    candidateReport.trendSignals.some((signal) =>
      isOfficialObservedTrendSignal(signal, candidateReport.date, selectedKeyword));
  if (!trendReady) {
    throw new Error(
      `Create-page Google Trends gate failed: selected draft ${selectedKeyword || "<empty>"} needs an ` +
      "official same-day observed signal with direction=rising or relativeInterest>=50",
    );
  }
}

function publicationClock() {
  const testOverride = process.env.NODE_ENV === "test"
    ? process.env.SEO_TEST_PUBLICATION_NOW
    : null;
  const value = testOverride ? new Date(testOverride) : new Date();
  if (!Number.isFinite(value.getTime())) throw new Error("Publication clock is invalid");
  return value;
}

function assertPublicationWindow(value) {
  if (shanghaiDate(value) !== report.date) {
    throw new Error(`The ${report.date} publishing window has closed in Asia/Shanghai`);
  }
  const match = String(unattendedPolicy.publishCutoffLocalTime || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Unattended publishing cutoff is invalid");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value).map((part) => [part.type, part.value]));
  const currentMinute = Number(parts.hour) * 60 + Number(parts.minute);
  const cutoffMinute = Number(match[1]) * 60 + Number(match[2]);
  if (currentMinute >= cutoffMinute) {
    throw new Error(`The ${report.date} publishing window closed at ${unattendedPolicy.publishCutoffLocalTime} Asia/Shanghai`);
  }
}

function coordinationContext() {
  const runId = process.env.CODEX_THREAD_ID || process.env.SEO_DAILY_RUN_ID;
  const testRoot = process.env.NODE_ENV === "test" ? process.env.SEO_TEST_COORDINATION_ROOT : null;
  const coordinationRoot = testRoot
    ? resolve(testRoot)
    : resolve(execFileSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: process.cwd(),
        encoding: "utf8",
      }).trim());
  return {
    coordinationRoot,
    owner: coordinationOwner(process.cwd(), runId),
  };
}

if (report.publication?.status !== "ready_for_review" || !report.draft?.quality?.passed) {
  throw new Error("Report does not contain a draft that passed automated gates");
}
assertCreatePagePublicationReadiness(report);
const draftDigest = report.draft?.schemaVersion === architecturePolicy.requiredDraftSchemaVersion
  ? sha256({ draft: report.draft, contentStrategy: report.contentStrategy })
  : sha256(report.draft);
if (!/^[a-f0-9]{64}$/.test(report.publication.draftDigest || "") ||
  review.draftDigest !== report.publication.draftDigest ||
  draftDigest !== report.publication.draftDigest) {
  throw new Error("Approval must match the exact SHA-256 digest of the reviewed draft");
}
if (!safeSlug.test(review.slug) || !validatePipelineReviewContract({
  review,
  reportId: report.id,
  expectedSlug: report.publication.slug,
  expectedDigest: report.publication.draftDigest,
  reportGeneratedAt: report.generatedAt,
  draftSchemaVersion: report.draft?.schemaVersion ?? null,
  requiredDraftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
  baseRequiredChecks: policy.requiredReviewChecks,
  architectureRequiredChecks: architecturePolicy.requiredReviewChecks,
})) {
  throw new Error("Approval record does not satisfy the reviewed draft contract");
}
if (retiredPageSlugs.has(review.slug)) {
  throw new Error(`Page /${review.slug} was retired by explicit user feedback and cannot be republished automatically`);
}

const pagesDirectory = resolve("data/pages");
function publishedPagesFromDisk() {
  return existsSync(pagesDirectory)
    ? readdirSync(pagesDirectory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson(resolve(pagesDirectory, name)))
      .filter((page) => page.status === "published")
    : [];
}
const pages = publishedPagesFromDisk();
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
const publicationTime = publicationClock();
assertPublicationWindow(publicationTime);
const publicationTimestamp = publicationTime.toISOString();
const publishedAt = sameSlug?.publishedAt || publicationTimestamp;
const page = {
  schemaVersion: policy.contentArchitecture.publishedPageSchemaVersion,
  status: "published",
  slug: review.slug,
  path: `/${review.slug}`,
  keyword: opportunity.keyword,
  publishedAt,
  updatedAt: publicationTimestamp,
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
const { coordinationRoot, owner } = coordinationContext();
withDailyPublicationGuard({
  coordinationRoot,
  date: report.date,
  owner,
  slug: review.slug,
  reportId: report.id,
  now: publicationTime,
}, (assertGuard) => {
  const currentReport = readJson(reportPath);
  assertCreatePagePublicationReadiness(currentReport);
  const currentPages = publishedPagesFromDisk();
  const currentSameSlug = currentPages.find((candidate) => candidate.slug === review.slug);
  const currentDigest = currentReport.draft?.schemaVersion === architecturePolicy.requiredDraftSchemaVersion
    ? sha256({ draft: currentReport.draft, contentStrategy: currentReport.contentStrategy })
    : sha256(currentReport.draft);
  if (currentReport.id !== report.id || currentReport.generatedAt !== report.generatedAt ||
    currentReport.publication?.draftDigest !== draftDigest || currentDigest !== draftDigest) {
    throw new Error("Reviewed report changed before the guarded publication write");
  }
  if (currentReport.publication?.status === "published") {
    if (!currentSameSlug || currentSameSlug.generatedFromReport !== report.id ||
      currentSameSlug.draftDigest !== draftDigest) {
      throw new Error("Published report does not have a matching page artifact");
    }
    return;
  }
  if (currentReport.publication?.status !== "ready_for_review") {
    throw new Error("Reviewed report is no longer ready for publication");
  }

  const guardedSameReportPages = currentPages.filter((candidate) =>
    candidate.generatedFromReport === report.id && candidate.slug !== review.slug);
  const guardedSameDayPages = currentPages.filter((candidate) =>
    candidate.slug !== review.slug && shanghaiDate(candidate.publishedAt) === report.date);
  if (guardedSameReportPages.length >= policy.dailyPageLimit) {
    throw new Error(`Report ${report.id} already reached its ${policy.dailyPageLimit}-page publication limit`);
  }
  if (guardedSameDayPages.length >= policy.dailyPageLimit) {
    throw new Error(`${report.date} already reached its ${policy.dailyPageLimit}-page publication limit`);
  }
  if (currentSameSlug && currentSameSlug.generatedFromReport !== report.id && report.publicationMode !== "update") {
    throw new Error(`Page /${review.slug} already exists and this report is not an update`);
  }

  const guardedPublishedAt = currentSameSlug?.publishedAt || publicationTimestamp;
  const guardedPage = {
    ...page,
    publishedAt: guardedPublishedAt,
    updatedAt: publicationTimestamp,
  };
  guardedPage.servedContentDigest = servedContentDigest(guardedPage);
  const pageAlreadyWritten = currentSameSlug?.generatedFromReport === report.id &&
    currentSameSlug?.draftDigest === draftDigest &&
    currentSameSlug?.servedContentDigest === guardedPage.servedContentDigest;
  assertGuard(publicationClock());
  if (!pageAlreadyWritten) {
    mkdirSync(dirname(pagePath), { recursive: true });
    writeJsonAtomic(pagePath, guardedPage);
  }

  const publication = {
    status: "published",
    slug: review.slug,
    path: `/${review.slug}`,
    slot: "morning",
    publishedAt: guardedPublishedAt,
    updatedAt: publicationTimestamp,
    draftDigest,
    reason: `Approved by ${review.reviewerType} ${review.reviewer} after automated and editorial gates passed.`,
  };
  const updatedReport = {
    ...currentReport,
    publication,
    publications: [publication],
    actions: currentReport.actions.map((action) => action.priority === "P2"
      ? { ...action, action: `Build and publish /${review.slug}`, why: publication.reason, expectedImpact: "Release one reviewed, measurable page." }
      : action),
    caveats: [...new Set([...(currentReport.caveats || []), "Publication required a separate editorial approval artifact."])],
  };
  assertGuard(publicationClock());
  writeJsonAtomic(resolve(reportPath), updatedReport);
});
process.stdout.write(`${pagePath}\n`);
