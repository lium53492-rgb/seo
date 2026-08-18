import "./load-env.mjs";

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { validatePageArchitecture, validateSeoArchitectureBridge } from "../lib/seo/content-contract.mjs";
import {
  analyzeContentNovelty,
  visiblePageText,
} from "../lib/seo/content-similarity.mjs";
import { publishedArchitectureHistoryFromReports } from "../lib/seo/content-history.mjs";
import { servedContentDigest } from "../lib/seo/served-content.mjs";
import { validatePipelineReviewContract } from "../lib/seo/pipeline-contract.mjs";
import { hasExplicitMarkdownList, unsupportedMarkdownReason } from "../lib/seo/markdown-semantics.mjs";
import { audienceDraftBlockers } from "../lib/seo/audience-policy.mjs";
import { assertOriginalIpBoundary } from "../lib/seo/ip-boundary.mjs";
import {
  normalizeGoogleTrendsTerm,
  validateGoogleTrendsEvidence,
} from "../lib/seo/google-trends-contract.mjs";
import {
  coordinationOwner,
  withDailyPublicationGuard,
} from "./lib/daily-coordination.mjs";
import { readDailyRunState } from "./lib/daily-run-state.mjs";

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
const siteConfig = readJson("data/config/site.json");
const activeProductFacts = factCatalog.facts.filter((fact) => fact.status === "active");
const activeFactStatements = activeProductFacts.map((fact) => fact.statement);
const approvedFactIds = new Set(activeProductFacts.map((fact) => fact.id));
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const retiredPageSlugs = new Set(Array.isArray(policy.retiredPageSlugs) ? policy.retiredPageSlugs : []);
const productMigrationHoldSlugs = new Set(
  Array.isArray(policy.productMigrationHoldSlugs) ? policy.productMigrationHoldSlugs : [],
);
const retiredRecipeIds = new Set(Array.isArray(policy.retiredRecipeIds) ? policy.retiredRecipeIds : []);
const retiredPaletteIds = new Set(Array.isArray(policy.retiredPaletteIds) ? policy.retiredPaletteIds : []);
const trendsAttestationVerificationKey = String(
  process.env.GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY || "",
).replace(/\\n/g, "\n").trim();
const trendsAttestationClientEmail = String(
  process.env.GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL || "",
).trim();

validateSeoArchitectureBridge(policy, architecturePolicy);

function assertDailyPublicationWasNotRetired(date) {
  const dailyState = readDailyRunState({ root: process.cwd(), date });
  if (dailyState.state === "retired_publication_complete") {
    throw new Error(
      `${date} already ended with retired publication /${dailyState.retiredSlug}; ` +
      "the daily slot cannot be reused for another publication",
    );
  }
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reviewedReportDigest(candidateReport) {
  if (candidateReport.draft?.schemaVersion !== architecturePolicy.requiredDraftSchemaVersion) {
    return sha256(candidateReport.draft);
  }
  return sha256({
    draft: candidateReport.draft,
    contentStrategy: candidateReport.contentStrategy,
    ...(candidateReport.date >= policy.googleTrends.automatedCollectionEnforcedFromReportDate
      ? { googleTrendsSnapshotDigest: candidateReport.trendCollection?.snapshotDigest ?? null }
      : {}),
  });
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

function assertVisualAuditFiles(reviewArtifact, reportArtifact) {
  if (reportArtifact.draft?.schemaVersion !== architecturePolicy.requiredDraftSchemaVersion ||
    reportArtifact.date < policy.visualAudit.enforcedFromReportDate) return;
  const expectedRoot = resolve(policy.visualAudit.screenshotDirectory, reportArtifact.date);
  for (const viewport of reviewArtifact.visualAudit?.viewports || []) {
    const screenshotPath = resolve(viewport.screenshotPath);
    const childPath = relative(expectedRoot, screenshotPath);
    if (!childPath || childPath.startsWith("..") || resolve(expectedRoot, childPath) !== screenshotPath) {
      throw new Error(`Visual audit screenshot escapes its dated evidence directory: ${viewport.screenshotPath}`);
    }
    if (!existsSync(screenshotPath)) {
      throw new Error(`Visual audit screenshot is missing: ${viewport.screenshotPath}`);
    }
    const digest = createHash("sha256").update(readFileSync(screenshotPath)).digest("hex");
    if (digest !== viewport.screenshotSha256) {
      throw new Error(`Visual audit screenshot digest changed after review: ${viewport.screenshotPath}`);
    }
  }
}

function assertEnhancedDraftRenderContract(candidateReport) {
  if (candidateReport.date < architecturePolicy.enhancedNoveltyEnforcedFromReportDate) return;
  const candidateDraft = candidateReport.draft;
  const keyword = String(candidateDraft?.keyword || "").trim().toLowerCase();
  const genericCtaPattern = /^(?:click here|learn more|get started|explore stories|explore story-led roleplay|try (?:novelai|playworlds)|start now|read more)(?:\s+(?:on|with)\s+(?:novelai|playworlds))?[.!]?$/i;
  const ctaTokens = new Set(
    `${keyword} ${candidateReport.contentStrategy?.readerOutcome || ""} ${candidateReport.contentStrategy?.primaryPainPoint || ""}`
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length >= 5 && !["novelai", "playworlds", "story", "stories", "roleplay", "using", "about"].includes(token)) || [],
  );
  if (genericCtaPattern.test(String(candidateDraft?.primaryCta || "").trim()) ||
    ![...ctaTokens].some((token) => candidateDraft.primaryCta.toLowerCase().includes(token))) {
    throw new Error("Publisher rejected a generic primary CTA that is not bound to the selected page outcome");
  }
  const sections = Array.isArray(candidateDraft?.sections) ? candidateDraft.sections : [];
  const faqs = Array.isArray(candidateDraft?.faqs) ? candidateDraft.faqs : [];
  const plainTextValues = [
    ["title", candidateDraft?.title], ["metaDescription", candidateDraft?.metaDescription],
    ["h1", candidateDraft?.h1], ["primaryCta", candidateDraft?.primaryCta],
    ...sections.map((section, index) => [`section ${index + 1} heading`, section.heading]),
    ...faqs.map((faq, index) => [`FAQ ${index + 1} question`, faq.question]),
    ...Object.entries(candidateDraft?.architecture?.presentation?.surfaceCopy || {}).map(([field, value]) => [`surfaceCopy.${field}`, value]),
    ["signature title", candidateDraft?.signatureModule?.title],
    ...(candidateDraft?.signatureModule?.items || []).flatMap((item, index) => [
      [`signature item ${index + 1} label`, item.label], [`signature item ${index + 1} title`, item.title],
    ]),
  ];
  const richTextValues = [
    ["heroMarkdown", candidateDraft?.heroMarkdown],
    ...sections.map((section, index) => [`section ${index + 1} bodyMarkdown`, section.bodyMarkdown]),
    ...faqs.map((faq, index) => [`FAQ ${index + 1} answerMarkdown`, faq.answerMarkdown]),
    ["signature intro", candidateDraft?.signatureModule?.intro],
    ...(candidateDraft?.signatureModule?.items || []).map((item, index) => [`signature item ${index + 1} bodyMarkdown`, item.bodyMarkdown]),
  ];
  const invalidPlain = plainTextValues.find(([, value]) => unsupportedMarkdownReason(value, { plainText: true }));
  const invalidRich = richTextValues.find(([, value]) => unsupportedMarkdownReason(value));
  if (invalidPlain || invalidRich) {
    const [label, value] = invalidPlain || invalidRich;
    throw new Error(`Publisher rejected unsupported Markdown in ${label}: ${unsupportedMarkdownReason(value, { plainText: Boolean(invalidPlain) })}`);
  }
  const unmarkedList = sections.find((section) =>
    ["steps", "checklist", "examples", "comparison"].includes(section.format) &&
    !hasExplicitMarkdownList(section.bodyMarkdown));
  if (unmarkedList) {
    throw new Error(`Publisher requires explicit Markdown list markers for ${unmarkedList.format} section ${unmarkedList.id || unmarkedList.heading}`);
  }
}

function registrableDomain(hostname) {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const commonSecondLevelSuffixes = new Set(["co.uk", "org.uk", "com.au", "com.cn", "com.hk", "co.jp"]);
  const lastTwo = labels.slice(-2).join(".");
  return commonSecondLevelSuffixes.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

function validatedBreakoutEvidencePolicy() {
  const config = policy.breakoutEvidence;
  const safeSignalToken = /^[a-z][a-z0-9_]*$/;
  if (
    config?.schemaVersion !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(config.enforcedFromReportDate || "") ||
    !safeSignalToken.test(config.requiredKind || "") ||
    !Array.isArray(config.allowedSignalTypes) ||
    !config.allowedSignalTypes.length ||
    new Set(config.allowedSignalTypes).size !== config.allowedSignalTypes.length ||
    config.allowedSignalTypes.some((type) => !safeSignalToken.test(type)) ||
    !Number.isInteger(config.minDetailChars) ||
    config.minDetailChars < 1 ||
    !Number.isInteger(config.minBasisChars) ||
    config.minBasisChars < 1
  ) {
    throw new Error("seo-policy breakoutEvidence configuration is invalid");
  }
  return config;
}

const breakoutEvidencePolicy = validatedBreakoutEvidencePolicy();
const firstPartyEvidenceDomain = registrableDomain(
  new URL(siteConfig.canonicalOrigin).hostname,
);

function validatePublishedBreakoutEvidence(item, reportDate, selectedKeyword) {
  let sourceUrl;
  try {
    sourceUrl = new URL(item?.url);
  } catch {
    throw new Error("Create-page breakout evidence has an invalid source URL");
  }
  const sourceDomain = registrableDomain(sourceUrl.hostname);
  if (
    !/^https?:$/.test(sourceUrl.protocol) ||
    sourceUrl.username ||
    sourceUrl.password ||
    !sourceUrl.hostname.includes(".") ||
    sourceDomain === firstPartyEvidenceDomain ||
    (sourceUrl.pathname === "/" && !sourceUrl.search)
  ) {
    throw new Error("Create-page breakout evidence needs a page-specific independent HTTP(S) source URL");
  }
  let collectedDate;
  try {
    collectedDate = shanghaiDate(item?.collectedAt);
  } catch {
    throw new Error("Create-page breakout evidence has an invalid collectedAt timestamp");
  }
  if (collectedDate !== reportDate) {
    throw new Error("Create-page breakout evidence must be collected on the report's Shanghai date");
  }
  const signal = item?.signal;
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
    throw new Error("Create-page breakout evidence needs a structured signal");
  }
  const allowedSignalFields = new Set(["type", "value", "unit", "basis", "detail"]);
  if (Object.keys(signal).some((field) => !allowedSignalFields.has(field))) {
    throw new Error("Create-page breakout evidence signal contains an unknown field");
  }
  const type = String(signal.type || "").trim();
  const unit = String(signal.unit || "").trim();
  const basis = String(signal.basis || "").trim();
  const detail = String(signal.detail || "").trim();
  if (!breakoutEvidencePolicy.allowedSignalTypes.includes(type)) {
    throw new Error("Create-page breakout evidence signal has an unsupported type");
  }
  if (typeof signal.value !== "number" || !Number.isFinite(signal.value) || signal.value <= 0) {
    throw new Error("Create-page breakout evidence signal needs a positive finite numeric value");
  }
  if (!unit || unit.length > 64 ||
    basis.length < breakoutEvidencePolicy.minBasisChars ||
    detail.length < breakoutEvidencePolicy.minDetailChars) {
    throw new Error("Create-page breakout evidence signal is incomplete");
  }
  return Array.isArray(item.supports) && item.supports.some((keyword) =>
    String(keyword).trim().toLowerCase() === selectedKeyword);
}

function assertPublishedBreakoutEvidence(candidateReport, selectedKeyword) {
  if (candidateReport.date < breakoutEvidencePolicy.enforcedFromReportDate) return;
  const evidence = Array.isArray(candidateReport.evidence) ? candidateReport.evidence : [];
  let qualifying = false;
  for (const item of evidence) {
    if (item?.kind !== breakoutEvidencePolicy.requiredKind) continue;
    if (validatePublishedBreakoutEvidence(item, candidateReport.date, selectedKeyword)) {
      qualifying = true;
    }
  }
  if (!qualifying) {
    throw new Error(
      `Create-page breakout evidence gate failed: selected draft ${selectedKeyword || "<empty>"} needs at least one ` +
      `same-day, page-specific independent ${breakoutEvidencePolicy.requiredKind} record with a structured supported signal`,
    );
  }
}

function assertCreatePagePublicationReadiness(candidateReport) {
  const requireBigQuery = candidateReport.date >=
    policy.googleTrends.automatedCollectionEnforcedFromReportDate;
  const validatedTrends = validateGoogleTrendsEvidence({
    trendSignals: candidateReport.trendSignals ?? [],
    trendCollection: candidateReport.trendCollection,
    candidateKeywords: (candidateReport.opportunities || []).map((item) => item?.keyword),
    reportDate: candidateReport.date,
    attestationVerificationKey: requireBigQuery
      ? trendsAttestationVerificationKey
      : undefined,
    expectedAttestationClientEmail: requireBigQuery
      ? trendsAttestationClientEmail
      : undefined,
    requireVerifiedAttestation: requireBigQuery,
  });
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
    portfolio?.globalAttribution?.product === "playworlds" &&
    portfolio?.globalAttribution?.state === "observed" &&
    portfolio?.globalAttribution?.attributionJoinReady === true &&
    entries.length === summary.publishedPages &&
    pageReadinessFailures.length === 0;
  if (!growthReady) {
    throw new Error(
      "Create-page growth readiness gate failed: every published page must be collected with " +
      "observed Search Console, landing UV, and qualified outbound evidence (zero values are allowed), " +
      "zero unavailable pages, and an independent Playworlds callback/store probe with attributionJoinReady=true",
    );
  }
  const selectedKeyword = normalizeGoogleTrendsTerm(candidateReport.draft?.keyword);
  const selectedSignal = validatedTrends.trendSignals.find((signal) =>
    normalizeGoogleTrendsTerm(signal?.keyword) === selectedKeyword);
  const collectionReady = validatedTrends.trendCollection?.state === "observed" ||
    (validatedTrends.trendCollection?.state === "unavailable" &&
      policy.googleTrends.providerUnavailableAllowsPublication === true);
  const signalReady = selectedSignal?.state === "observed" ||
    (selectedSignal?.state === "not_observed" && policy.googleTrends.notObservedAllowsPublication === true) ||
    (selectedSignal?.state === "unavailable" &&
      policy.googleTrends.providerUnavailableAllowsPublication === true);
  const trendReady = collectionReady && signalReady;
  if (!trendReady) {
    throw new Error(
      `Create-page Google Trends evidence failed: selected draft ${selectedKeyword || "<empty>"} needs a ` +
      "verified same-day collection and an explicit observed or not_observed candidate result",
    );
  }
  assertPublishedBreakoutEvidence(candidateReport, selectedKeyword);
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

assertDailyPublicationWasNotRetired(report.date);
if (report.publication?.status !== "ready_for_review" || !report.draft?.quality?.passed) {
  throw new Error("Report does not contain a draft that passed automated gates");
}
assertCreatePagePublicationReadiness(report);
const draftDigest = reviewedReportDigest(report);
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
  reportDate: report.date,
  visualAuditPolicy: policy.visualAudit,
})) {
  throw new Error("Approval record does not satisfy the reviewed draft contract");
}
assertVisualAuditFiles(review, report);
assertEnhancedDraftRenderContract(report);
if (retiredPageSlugs.has(review.slug)) {
  throw new Error(`Page /${review.slug} was retired by explicit user feedback and cannot be republished automatically`);
}

const pagesDirectory = resolve("data/pages");
function publishedPagesFromDisk() {
  return existsSync(pagesDirectory)
    ? readdirSync(pagesDirectory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson(resolve(pagesDirectory, name)))
      .filter((page) => page.status === "published" && !productMigrationHoldSlugs.has(page.slug))
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
if (retiredRecipeIds.has(draft.architecture?.presentation?.recipeId) ||
  retiredPaletteIds.has(draft.architecture?.presentation?.paletteId)) {
  throw new Error("Reviewed draft uses a presentation recipe or palette retired by explicit user feedback");
}
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
  allowedPhrases: activeFactStatements,
  enforceEnhancedNovelty: report.date >= architecturePolicy.enhancedNoveltyEnforcedFromReportDate,
});
if (!novelty.passed) {
  const first = novelty.violations[0];
  throw new Error(`Content distinctness changed after review [${first.code}]: ${first.detail}`);
}
if (!Array.isArray(draft.factIdsUsed) || new Set(draft.factIdsUsed).size < 2 ||
  new Set(draft.factIdsUsed).size !== draft.factIdsUsed.length ||
  draft.factIdsUsed.some((id) => !approvedFactIds.has(id))) {
  throw new Error("Reviewed draft uses an unapproved or missing product fact ID");
}
if (productMigrationHoldSlugs.has(review.slug)) {
  throw new Error(
    `Page /${review.slug} is on product-migration hold. Remove the hold only with a newly approved Playworlds-fact report and matching editorial review.`,
  );
}

function assertDraftOriginalIpBoundary(candidateReport) {
  const candidateDraft = candidateReport.draft;
  const candidateOpportunity = candidateReport.opportunities?.find((item) => item.keyword === candidateDraft?.keyword);
  assertOriginalIpBoundary({
    policy,
    reportDate: candidateReport.date,
    draftSchemaVersion: candidateDraft?.schemaVersion,
    ipBoundary: candidateDraft?.ipBoundary,
    visibleText: `${candidateOpportunity?.keyword || candidateDraft?.keyword || ""} ${visiblePageText(candidateDraft || {})}`,
  });
}

function assertDraftAudienceContract(candidateReport) {
  const candidateDraft = candidateReport.draft;
  const candidateOpportunity = candidateReport.opportunities?.find((item) => item.keyword === candidateDraft?.keyword);
  const audienceBlockers = audienceDraftBlockers({
    policy,
    reportDate: candidateReport.date,
    keyword: candidateOpportunity?.keyword,
    h1: candidateDraft?.h1,
    factIds: candidateDraft?.factIdsUsed,
    architecture: candidateDraft?.architecture,
    visibleText: visiblePageText(candidateDraft || {}),
  });
  if (audienceBlockers.length) {
    throw new Error(`Reviewed draft violates the D&D-first audience contract: ${audienceBlockers.join("; ")}`);
  }
}
const publishableText = visiblePageText(draft);
assertDraftAudienceContract(report);
assertDraftOriginalIpBoundary(report);
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
  ipBoundary: draft.ipBoundary,
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
  assertDailyPublicationWasNotRetired(report.date);
  const currentReport = readJson(reportPath);
  const currentReview = readJson(reviewPath);
  assertCreatePagePublicationReadiness(currentReport);
  if (!validatePipelineReviewContract({
    review: currentReview,
    reportId: currentReport.id,
    expectedSlug: currentReport.publication?.slug,
    expectedDigest: currentReport.publication?.draftDigest,
    reportGeneratedAt: currentReport.generatedAt,
    draftSchemaVersion: currentReport.draft?.schemaVersion ?? null,
    requiredDraftSchemaVersion: architecturePolicy.requiredDraftSchemaVersion,
    baseRequiredChecks: policy.requiredReviewChecks,
    architectureRequiredChecks: architecturePolicy.requiredReviewChecks,
    reportDate: currentReport.date,
    visualAuditPolicy: policy.visualAudit,
  })) {
    throw new Error("Approval record changed before the guarded publication write");
  }
  assertVisualAuditFiles(currentReview, currentReport);
  assertEnhancedDraftRenderContract(currentReport);
  assertDraftAudienceContract(currentReport);
  assertDraftOriginalIpBoundary(currentReport);
  if (retiredRecipeIds.has(currentReport.draft?.architecture?.presentation?.recipeId) ||
    retiredPaletteIds.has(currentReport.draft?.architecture?.presentation?.paletteId)) {
    throw new Error("Guarded publication draft uses a retired presentation recipe or palette");
  }
  const currentPages = publishedPagesFromDisk();
  const currentSameSlug = currentPages.find((candidate) => candidate.slug === review.slug);
  const currentDigest = reviewedReportDigest(currentReport);
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
