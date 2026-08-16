import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import seoPolicy from "@/data/config/seo-policy.json";
import architecturePolicy from "@/data/config/content-architecture.json";
import type { DailySeoReport } from "./types";
import { isReportDraft } from "./report-draft-validation.mjs";
import { validateSeoArchitectureBridge } from "./content-contract.mjs";
import { validateGoogleTrendsEvidence } from "./google-trends-contract.mjs";

validateSeoArchitectureBridge(seoPolicy, architecturePolicy);

type GithubContent = {
  sha?: string;
  content?: string;
  encoding?: string;
  name?: string;
  path?: string;
  type?: string;
};

type DecisionEvidenceRecord = Record<string, unknown> & {
  evidenceRefs: string[];
  rationale: Record<string, unknown>;
};

type EvidenceItemRecord = Record<string, unknown> & {
  id?: string;
  supports: string[];
};

const DEFAULT_REPORTS_REPO = "lium53492-rgb/seo";
const githubRequestTimeoutMs = 5_000;
const reportModes = new Set(["disconnected", "live", "partial"]);
const intents = new Set(["commercial", "informational", "navigational", "transactional", "mixed"]);
const recommendedActions = new Set(["create_page", "improve_page", "consolidate", "observe"]);
const priorities = new Set(["P0", "P1", "P2"]);
const integrationStates = new Set(["connected", "configured", "replaced", "missing", "error"]);
const metricSources = new Set(["search_console", "vercel_analytics", "first_party_analytics", "seo_redirect", "product_analytics", "payments"]);
const landingUvSources = new Set(["vercel_analytics", "first_party_analytics"]);
const safeRepository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const safeBranch = /^[A-Za-z0-9._/-]+$/;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const safeEvidenceId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const decisionEvidencePolicy = seoPolicy.decisionEvidence;
const productSignals = new Set(Object.keys(decisionEvidencePolicy.productSignals));
const trialSignals = new Set(Object.keys(decisionEvidencePolicy.trialSignals));
const revenueSignals = new Set(Object.keys(decisionEvidencePolicy.revenueSignals));
const specificitySignals = new Set(Object.keys(decisionEvidencePolicy.specificitySignals));
const ipClasses = new Set(Object.keys(decisionEvidencePolicy.ipClasses));
const cannibalizationClasses = new Set(Object.keys(decisionEvidencePolicy.cannibalizationClasses));
const decisionRationaleFields = [
  "demand",
  "difficulty",
  "productFit",
  "trialIntent",
  "revenueIntent",
  "intentSpecificity",
  "originality",
  "ipRisk",
  "cannibalizationRisk",
];

function githubFetch(input: string, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(githubRequestTimeoutMs),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isKnownUniqueStringArray(value: unknown, allowed?: Set<string>): value is string[] {
  return isStringArray(value) &&
    new Set(value).size === value.length &&
    (!allowed || value.every((item) => allowed.has(item)));
}

function isDecisionEvidence(value: unknown): value is DecisionEvidenceRecord {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
    !isKnownUniqueStringArray(value.evidenceRefs) || value.evidenceRefs.length < 2 ||
    value.evidenceRefs.some((id) => !safeEvidenceId.test(id)) ||
    !isString(value.searcherJob) ||
    value.searcherJob.trim().length < decisionEvidencePolicy.minSearcherJobChars ||
    !isKnownUniqueStringArray(value.productFactIds) ||
    !isKnownUniqueStringArray(value.productSignals, productSignals) ||
    !isKnownUniqueStringArray(value.trialSignals, trialSignals) ||
    !isKnownUniqueStringArray(value.revenueSignals, revenueSignals) ||
    !isKnownUniqueStringArray(value.specificitySignals, specificitySignals) ||
    !isString(value.ipClass) || !ipClasses.has(value.ipClass) ||
    !isString(value.cannibalizationClass) || !cannibalizationClasses.has(value.cannibalizationClass) ||
    !(value.nearestExistingSlug === null ||
      (isString(value.nearestExistingSlug) && safeSlug.test(value.nearestExistingSlug)))) return false;
  const rationale = value.rationale;
  if (!isRecord(rationale)) return false;
  return decisionRationaleFields.every((field) =>
    isString(rationale[field]) &&
    rationale[field].trim().length >= decisionEvidencePolicy.minRationaleChars);
}

function isOpportunity(value: unknown, requireDecisionEvidence = false) {
  return isRecord(value) &&
    isString(value.keyword) &&
    isString(value.seed) &&
    isString(value.source) &&
    isFiniteMetric(value.volume) &&
    isFiniteMetric(value.difficulty) && value.difficulty <= 100 &&
    isFiniteMetric(value.cpc) &&
    isString(value.intent) && intents.has(value.intent) &&
    Array.isArray(value.trend) && value.trend.every(isFiniteMetric) &&
    isFiniteMetric(value.productFit) && value.productFit <= 100 &&
    isFiniteMetric(value.originality) && value.originality <= 100 &&
    isFiniteMetric(value.conversionIntent) && value.conversionIntent <= 100 &&
    isFiniteMetric(value.ipRisk) && value.ipRisk <= 100 &&
    isFiniteMetric(value.cannibalizationRisk) && value.cannibalizationRisk <= 100 &&
    isFiniteMetric(value.score) && value.score <= 100 &&
    isString(value.action) && recommendedActions.has(value.action) &&
    isString(value.reason) &&
    (!requireDecisionEvidence || (
      value.scoreBasis === "evidence_signals_v1" &&
      isFiniteMetric(value.trialIntent) && value.trialIntent <= 100 &&
      isFiniteMetric(value.revenueIntent) && value.revenueIntent <= 100 &&
      isFiniteMetric(value.intentSpecificity) && value.intentSpecificity <= 100 &&
      isDecisionEvidence(value.decisionEvidence)
    ));
}

function isEvidenceItem(value: unknown, requireId = false): value is EvidenceItemRecord {
  return isRecord(value) &&
    (!requireId || (isString(value.id) && safeEvidenceId.test(value.id))) &&
    isString(value.title) &&
    isString(value.url) &&
    isString(value.source) &&
    isString(value.collectedAt) &&
    isStringArray(value.supports);
}

function hasValidEvidenceReferences(value: Record<string, unknown>) {
  if (value.policyVersion !== 4) return true;
  if (!Array.isArray(value.evidence) || !Array.isArray(value.opportunities)) return false;
  const evidenceItems = value.evidence.filter((item) => isEvidenceItem(item, true));
  if (evidenceItems.length !== value.evidence.length) return false;
  const evidenceById = new Map(
    evidenceItems.map((item) => [String(item.id), item]),
  );
  if (evidenceById.size !== evidenceItems.length) return false;
  return value.opportunities.every((opportunity) => {
    if (!isRecord(opportunity) || !isDecisionEvidence(opportunity.decisionEvidence)) return false;
    return opportunity.decisionEvidence.evidenceRefs.every((id) => {
      const item = evidenceById.get(id);
      return item && Array.isArray(item.supports) &&
        item.supports.some((keyword) =>
          typeof keyword === "string" &&
          keyword.trim().toLowerCase() === String(opportunity.keyword).trim().toLowerCase());
    });
  });
}

function isPerformance(value: unknown) {
  return isRecord(value) &&
    isString(value.url) &&
    isString(value.query) &&
    isFiniteMetric(value.clicks) &&
    isFiniteMetric(value.impressions) && value.clicks <= value.impressions &&
    isFiniteMetric(value.ctr) && value.ctr <= 1 &&
    isFiniteMetric(value.position) &&
    isString(value.recommendedAction);
}

function hasValidTrendEvidence(
  signals: unknown,
  collection: unknown,
  opportunities: unknown[],
  reportDate: string,
) {
  if (!Array.isArray(signals)) return false;
  try {
    validateGoogleTrendsEvidence({
      trendSignals: signals,
      trendCollection: collection,
      candidateKeywords: opportunities
        .filter(isRecord)
        .map((opportunity) => String(opportunity.keyword)),
      reportDate,
    });
    return true;
  } catch {
    return false;
  }
}

function isAction(value: unknown) {
  return isRecord(value) &&
    isString(value.priority) && priorities.has(value.priority) &&
    isString(value.action) && isString(value.why) && isString(value.expectedImpact);
}

function isIntegration(value: unknown) {
  return isRecord(value) && isString(value.id) && isString(value.name) &&
    isString(value.state) && integrationStates.has(value.state) && isString(value.detail) &&
    (value.lastCheckedAt === undefined || (isString(value.lastCheckedAt) && Number.isFinite(Date.parse(value.lastCheckedAt))));
}

function isObservedMetric(value: unknown) {
  return isRecord(value) &&
    (value.status === "observed" || value.status === "unavailable") &&
    isString(value.source) && metricSources.has(value.source) &&
    isString(value.detail) &&
    (value.status === "observed" ? isFiniteMetric(value.value) : value.value === null);
}

function isFunnel(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
    value.aggregationKey !== "source_slug+reporting_period" ||
    (value.conversionJoinKey ?? value.joinKey) !== "seo_click_id" ||
    !isString(value.periodStart) || !Number.isFinite(Date.parse(value.periodStart)) ||
    !isString(value.periodEnd) || !Number.isFinite(Date.parse(value.periodEnd)) ||
    Date.parse(value.periodStart) >= Date.parse(value.periodEnd)) return false;
  const metrics = value.metrics;
  if (!isRecord(metrics)) return false;
  const names = [
    "organicClicks",
    "landingUv",
    "qualifiedOutboundClicks",
    "trialStarts",
    "signups",
    "paidConversions",
    "revenueMinor",
  ];
  return names.every((name) => isObservedMetric(metrics[name])) &&
    (value.currency === undefined || (isString(value.currency) && /^[A-Z]{3}$/.test(value.currency)));
}

function isNullableMetric(value: unknown) {
  return value === null || isFiniteMetric(value);
}

function isSearchPerformance(value: unknown, sourceSlug: string) {
  if (!isRecord(value) ||
    (value.state !== "observed" && value.state !== "unavailable") ||
    value.sourceSlug !== sourceSlug ||
    !isString(value.pageUrl) || !value.pageUrl.startsWith("https://") ||
    !isString(value.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(value.startDate) ||
    !isString(value.endDate) || !/^\d{4}-\d{2}-\d{2}$/.test(value.endDate) ||
    !isString(value.detail)) return false;
  if (value.state === "unavailable") {
    return value.clicks === null &&
      value.impressions === null &&
      value.ctr === null &&
      value.position === null;
  }
  return isFiniteMetric(value.clicks) &&
    isFiniteMetric(value.impressions) &&
    isFiniteMetric(value.ctr) && value.ctr <= 1 &&
    isNullableMetric(value.position);
}

function isSafePublicCanonical(value: unknown, pageUrl: URL) {
  if (value === null) return true;
  if (!isString(value)) return false;
  try {
    const canonical = new URL(value);
    return ["http:", "https:"].includes(canonical.protocol) &&
      canonical.origin === pageUrl.origin &&
      canonical.username === "" &&
      canonical.password === "" &&
      canonical.search === "" &&
      canonical.hash === "";
  } catch {
    return false;
  }
}

function isUrlInspection(value: unknown, sourceSlug: string) {
  if (!isRecord(value) ||
    (value.state !== "observed" && value.state !== "unavailable") ||
    value.sourceSlug !== sourceSlug ||
    !isString(value.pageUrl) || !value.pageUrl.startsWith("https://") ||
    !isString(value.inspectedAt) || !Number.isFinite(Date.parse(value.inspectedAt)) ||
    !Array.isArray(value.sitemap) ||
    value.sitemap.length !== 0 ||
    !isString(value.detail)) return false;
  let pageUrl;
  try {
    pageUrl = new URL(value.pageUrl);
  } catch {
    return false;
  }
  const nullableFields = [
    "verdict",
    "coverageState",
    "robotsTxtState",
    "indexingState",
    "pageFetchState",
    "lastCrawlTime",
    "googleCanonical",
    "userCanonical",
    "crawledAs",
  ];
  if (nullableFields.some((field) =>
    value[field] !== null && !isString(value[field]))) return false;
  if (value.lastCrawlTime !== null &&
    (!isString(value.lastCrawlTime) || !Number.isFinite(Date.parse(value.lastCrawlTime)))) return false;
  if (
    !isSafePublicCanonical(value.googleCanonical, pageUrl) ||
    !isSafePublicCanonical(value.userCanonical, pageUrl)
  ) return false;
  if (value.state === "unavailable") {
    return nullableFields.every((field) => value[field] === null) &&
      value.sitemap.length === 0;
  }
  return nullableFields.some((field) => value[field] !== null);
}

function isPublicGrowthMetric(value: unknown, sources: ReadonlySet<string>) {
  return isObservedMetric(value) &&
    isRecord(value) &&
    isString(value.source) &&
    sources.has(value.source);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isRetiredUrlGrowth(
  value: unknown,
  activeSlugs: Set<string>,
) {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length + activeSlugs.size > 500) return false;
  const retiredSlugs = new Set<string>();
  const baseKeys = ["sourceSlug", "path", "retiredAt", "state"];
  return value.every((entry) => {
    if (!isRecord(entry) ||
      !isString(entry.sourceSlug) || !safeSlug.test(entry.sourceSlug) ||
      entry.path !== `/${entry.sourceSlug}` ||
      activeSlugs.has(entry.sourceSlug) || retiredSlugs.has(entry.sourceSlug) ||
      (entry.retiredAt !== undefined &&
        (!isString(entry.retiredAt) || !Number.isFinite(Date.parse(entry.retiredAt))))) {
      return false;
    }
    retiredSlugs.add(entry.sourceSlug);
    if (entry.state === "unavailable") {
      return hasOnlyKeys(entry, new Set([...baseKeys, "reason"])) &&
        isString(entry.reason) && entry.reason.trim().length >= 20;
    }
    if (entry.state !== "collected") return false;
    return hasOnlyKeys(
      entry,
      new Set([...baseKeys, "searchPerformance", "urlInspection"]),
    ) &&
      isSearchPerformance(entry.searchPerformance, entry.sourceSlug) &&
      isUrlInspection(entry.urlInspection, entry.sourceSlug);
  });
}

function isGrowthPortfolio(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== 2 ||
    value.privacyClass !== "public_growth_evidence" ||
    value.periodBasis !== "complete_shanghai_calendar_days" ||
    (value.reportingWindowDays !== undefined &&
      (!Number.isInteger(value.reportingWindowDays) ||
        Number(value.reportingWindowDays) < 1 ||
        Number(value.reportingWindowDays) > 93)) ||
    (value.reportingLagDays !== undefined &&
      (!Number.isInteger(value.reportingLagDays) ||
        Number(value.reportingLagDays) < 0 ||
        Number(value.reportingLagDays) > 14)) ||
    value.aggregationKey !== "source_slug+reporting_period" ||
    !isString(value.generatedAt) || !Number.isFinite(Date.parse(value.generatedAt)) ||
    !isString(value.periodStart) || !Number.isFinite(Date.parse(value.periodStart)) ||
    !isString(value.periodEnd) || !Number.isFinite(Date.parse(value.periodEnd)) ||
    Date.parse(value.periodStart) >= Date.parse(value.periodEnd) ||
    Date.parse(value.periodEnd) > Date.parse(value.generatedAt) ||
    !isRecord(value.summary) ||
    !Number.isInteger(value.summary.publishedPages) || Number(value.summary.publishedPages) < 0 ||
    !Number.isInteger(value.summary.collectedPages) || Number(value.summary.collectedPages) < 0 ||
    !Number.isInteger(value.summary.unavailablePages) || Number(value.summary.unavailablePages) < 0 ||
    typeof value.summary.attributionJoinReady !== "boolean" ||
    typeof value.summary.attributionJoinBlocked !== "boolean" ||
    typeof value.summary.hasSearchValidatedLandingPage !== "boolean" ||
    !Array.isArray(value.entries)) return false;

  const globalAttribution = value.globalAttribution;
  const hasGlobalAttribution = globalAttribution !== undefined;
  if (hasGlobalAttribution && (
    !isRecord(globalAttribution) ||
    globalAttribution.schemaVersion !== 1 ||
    globalAttribution.product !== "playworlds" ||
    !["observed", "unavailable"].includes(String(globalAttribution.state)) ||
    typeof globalAttribution.attributionJoinReady !== "boolean" ||
    !isString(globalAttribution.detail) ||
    (globalAttribution.state !== "observed" && globalAttribution.attributionJoinReady)
  )) return false;

  const slugs = new Set<string>();
  let collectedPages = 0;
  let attributionJoinBlocked = false;
  let attributionJoinReady = true;
  let hasSearchValidatedLandingPage = false;
  for (const entry of value.entries) {
    if (!isRecord(entry) || !isString(entry.sourceSlug) || !isString(entry.path) || !isString(entry.keyword) ||
      !safeSlug.test(entry.sourceSlug) || entry.path !== `/${entry.sourceSlug}` ||
      slugs.has(entry.sourceSlug)) return false;
    slugs.add(entry.sourceSlug);
    if (entry.state === "unavailable") {
      if (!isString(entry.reason)) return false;
      continue;
    }
    if (entry.state !== "collected" || !isRecord(entry.report) ||
      entry.report.sourceSlug !== entry.sourceSlug ||
      !isRecord(entry.report.metrics) ||
      !isPublicGrowthMetric(entry.report.metrics.landingUv, landingUvSources) ||
      !isPublicGrowthMetric(entry.report.metrics.qualifiedOutboundClicks, new Set(["seo_redirect"])) ||
      !isSearchPerformance(entry.report.searchPerformance, entry.sourceSlug) ||
      !isUrlInspection(entry.report.urlInspection, entry.sourceSlug) ||
      !isRecord(entry.report.decisionState)) return false;
    const state = entry.report.decisionState;
    const landingUv = entry.report.metrics.landingUv as {
      status: "observed" | "unavailable";
      value: number | null;
    };
    const qualifiedOutboundClicks = entry.report.metrics.qualifiedOutboundClicks as {
      status: "observed" | "unavailable";
      value: number | null;
    };
    const searchPerformance = entry.report.searchPerformance as {
      state: "observed" | "unavailable";
      impressions: number | null;
    };
    const urlInspection = entry.report.urlInspection as {
      state: "observed" | "unavailable";
    };
    const booleanFields = [
      "landingUvReady",
      "qualifiedOutboundReady",
      "searchPerformanceReady",
      "urlInspectionReady",
      "attributionJoinChecked",
      "attributionJoinBlocked",
      "samePageSearchValidated",
    ];
    if (booleanFields.some((field) => typeof state[field] !== "boolean") ||
      (state.attributionJoinBlocked && !state.attributionJoinChecked) ||
      state.landingUvReady !== (landingUv.status === "observed") ||
      state.qualifiedOutboundReady !==
        (qualifiedOutboundClicks.status === "observed") ||
      state.searchPerformanceReady !== (searchPerformance.state === "observed") ||
      state.urlInspectionReady !== (urlInspection.state === "observed") ||
      state.samePageSearchValidated !== (
        landingUv.status === "observed" &&
        Number(landingUv.value) > 0 &&
        searchPerformance.state === "observed" &&
        Number(searchPerformance.impressions) > 0
      )) return false;
    attributionJoinBlocked ||= state.attributionJoinBlocked === true;
    attributionJoinReady &&= state.attributionJoinChecked === true;
    hasSearchValidatedLandingPage ||= state.samePageSearchValidated === true;
    collectedPages += 1;
  }
  attributionJoinReady = hasGlobalAttribution
    ? globalAttribution.attributionJoinReady === true
    : attributionJoinReady && collectedPages === value.entries.length;
  if (!isRetiredUrlGrowth(value.retiredUrls, slugs)) return false;
  return value.summary.publishedPages === value.entries.length &&
    value.summary.collectedPages === collectedPages &&
    value.summary.unavailablePages === value.entries.length - collectedPages &&
    value.summary.attributionJoinReady === attributionJoinReady &&
    value.summary.attributionJoinBlocked === attributionJoinBlocked &&
    value.summary.hasSearchValidatedLandingPage === hasSearchValidatedLandingPage;
}

function isPortfolioDecision(value: unknown) {
  if (!(isRecord(value) &&
    value.schemaVersion === 1 &&
    isString(value.action) && recommendedActions.has(value.action) &&
    (value.targetSlug === null || isString(value.targetSlug)) &&
    isString(value.rationale) &&
    isStringArray(value.evidenceSlugs) &&
    new Set(value.evidenceSlugs).size === value.evidenceSlugs.length)) return false;
  if (value.action !== "consolidate") {
    return value.sourceSlug === undefined && value.overlapQueries === undefined;
  }
  return isString(value.sourceSlug) &&
    value.sourceSlug !== value.targetSlug &&
    isStringArray(value.overlapQueries) &&
    value.overlapQueries.length > 0 &&
    new Set(value.overlapQueries).size === value.overlapQueries.length &&
    value.evidenceSlugs.includes(value.sourceSlug) &&
    isString(value.targetSlug) &&
    value.evidenceSlugs.includes(value.targetSlug);
}

function isBrief(value: unknown) {
  if (value === null) return true;
  return isRecord(value) && isString(value.keyword) && isString(value.slug) &&
    isString(value.pageType) && isString(value.searchIntent) && intents.has(value.searchIntent) &&
    isString(value.title) && isString(value.description) && isString(value.h1) &&
    isString(value.primaryCta) && isStringArray(value.sections) &&
    isStringArray(value.evidenceRequired) && isStringArray(value.qualityGate);
}

function isPublication(value: unknown) {
  if (!isRecord(value) ||
    !["published", "ready_for_review", "blocked", "not_requested"].includes(String(value.status)) ||
    !isString(value.reason)) return false;
  return (value.path === undefined || (isString(value.path) && value.path.startsWith("/"))) &&
    (value.slug === undefined || (isString(value.slug) && safeSlug.test(value.slug))) &&
    (value.slot === undefined || value.slot === "morning" || value.slot === "afternoon") &&
    (value.publishedAt === undefined ||
      (isString(value.publishedAt) && Number.isFinite(Date.parse(value.publishedAt)))) &&
    (value.draftDigest === undefined ||
      (isString(value.draftDigest) && /^[a-f0-9]{64}$/.test(value.draftDigest)));
}

function hasValidFeedbackDecisions(value: unknown) {
  if (!Array.isArray(value)) return false;
  const identities = new Set<string>();
  return value.every((item) => {
    if (!isRecord(item) ||
      !isString(item.id) ||
      !isString(item.date) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      typeof item.message !== "string" || !item.message.trim() ||
      (item.decision !== "adopted" && item.decision !== "rejected") ||
      !isString(item.rationale)) return false;
    const identity = `${item.date}|${item.id}`;
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
}

function hasValidContentStrategy(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== 2) return false;
  const requiredFields = [
    "searcherJob",
    "readerStateBefore",
    "readerOutcome",
    "primaryPainPoint",
    "oneSentenceAnswer",
    "originalContribution",
    "productBridge",
    "contextualNextStep",
    "evidenceBoundary",
    "conversionHypothesis",
    "measurementPlan",
  ];
  return requiredFields.every((field) => isString(value[field]) && value[field].trim().length >= 20) &&
    architecturePolicy.painPointIds.includes(String(value.painPointId)) &&
    seoPolicy.allowedPagePatterns.includes(String(value.pagePattern)) &&
    ["qualified_outbound_click", "trial_start", "purchase"].includes(String(value.primaryConversion));
}

export function parseReport(raw: string, source: string): DailySeoReport {
  const value = JSON.parse(raw) as unknown;
  const isStructuredPolicyReport = isRecord(value) &&
    (value.policyVersion === 3 || value.policyVersion === 4);
  const requiresContentArchitecture = isRecord(value) && value.policyVersion === 4 &&
    isString(value.date) && value.date >= seoPolicy.contentArchitecture.enforcedFromReportDate;
  const requiresDecisionEvidence = isRecord(value) && value.policyVersion === 4;
  if (!isRecord(value) ||
    (value.policyVersion !== undefined && value.policyVersion !== 3 && value.policyVersion !== 4) ||
    typeof value.id !== "string" ||
    typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
    typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) ||
    typeof value.mode !== "string" || !reportModes.has(value.mode) ||
    typeof value.headline !== "string" ||
    !isRecord(value.summary) ||
    !isFiniteMetric(value.summary.candidatesAnalyzed) ||
    !isFiniteMetric(value.summary.publishableOpportunities) ||
    !isFiniteMetric(value.summary.totalClicks) ||
    !isFiniteMetric(value.summary.totalImpressions) ||
    !isFiniteMetric(value.summary.averageCtr) ||
    !Array.isArray(value.opportunities) ||
    !value.opportunities.every((opportunity) =>
      isOpportunity(opportunity, requiresDecisionEvidence)) ||
    !Array.isArray(value.performance) || !value.performance.every(isPerformance) ||
    !Array.isArray(value.actions) || !value.actions.every(isAction) ||
    !isBrief(value.brief) ||
    (value.publication !== undefined && !isPublication(value.publication)) ||
    (value.publications !== undefined && (
      !Array.isArray(value.publications) ||
      !value.publications.every(isPublication)
    )) ||
    !isReportDraft(value.draft, { allowLegacyMetadata: !isStructuredPolicyReport }) ||
    (requiresContentArchitecture && isRecord(value.draft) && value.draft.schemaVersion !== 2) ||
    (value.drafts !== undefined && (
      !Array.isArray(value.drafts) ||
      !value.drafts.every((draft) =>
        isReportDraft(draft, { allowLegacyMetadata: !isStructuredPolicyReport }) &&
        (!requiresContentArchitecture || (isRecord(draft) && draft.schemaVersion === 2)))
    )) ||
    (requiresContentArchitecture && !hasValidContentStrategy(value.contentStrategy)) ||
    (value.funnel !== undefined && !isFunnel(value.funnel)) ||
    (value.portfolioFunnels !== undefined && !isGrowthPortfolio(value.portfolioFunnels)) ||
    (value.portfolioDecision !== undefined && !isPortfolioDecision(value.portfolioDecision)) ||
    (value.evidence !== undefined && (
      !Array.isArray(value.evidence) ||
      !value.evidence.every((item) => isEvidenceItem(item, requiresDecisionEvidence))
    )) ||
    ((value.trendSignals !== undefined || value.trendCollection !== undefined) &&
      !hasValidTrendEvidence(
        value.trendSignals ?? [],
        value.trendCollection,
        value.opportunities,
        value.date,
      )) ||
    (value.feedbackDecisions !== undefined &&
      !hasValidFeedbackDecisions(value.feedbackDecisions)) ||
    !hasValidEvidenceReferences(value) ||
    !Array.isArray(value.integrations) || !value.integrations.every(isIntegration) ||
    !Array.isArray(value.caveats) || !value.caveats.every(isString)) {
    throw new Error(`Invalid SEO report shape: ${source}`);
  }
  return value as unknown as DailySeoReport;
}

function githubConfig() {
  const config = {
    token: process.env.GITHUB_REPORTS_TOKEN,
    repository: process.env.GITHUB_REPORTS_REPO || DEFAULT_REPORTS_REPO,
    branch: process.env.GITHUB_REPORTS_BRANCH || "main",
  };
  if (!safeRepository.test(config.repository) || !safeBranch.test(config.branch) || config.branch.includes("..")) {
    throw new Error("GitHub report repository or branch configuration is invalid");
  }
  return config;
}

function headers(token?: string) {
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchStoredReport(path: string) {
  const { token, repository, branch } = githubConfig();
  const response = await githubFetch(
    `https://api.github.com/repos/${repository}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: headers(token), cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub report read failed: ${response.status}`);
  const item = (await response.json()) as GithubContent;
  if (!item.content || item.encoding !== "base64") return null;
  const json = Buffer.from(item.content.replace(/\n/g, ""), "base64").toString("utf8");
  return parseReport(json, path);
}

async function readBundledReportHistory(limit: number) {
  const reportsDirectory = resolve(process.cwd(), "data/reports");
  try {
    const names = (await readdir(reportsDirectory))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, limit)
      .reverse();
    return Promise.all(
      names.map(async (name) => {
        const path = resolve(reportsDirectory, name);
        return parseReport(await readFile(path, "utf8"), path);
      }),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readRemoteReportHistory(limit: number, token: string) {
  const { repository, branch } = githubConfig();
  const response = await githubFetch(
    `https://api.github.com/repos/${repository}/contents/data/reports?ref=${encodeURIComponent(branch)}`,
    { headers: headers(token), cache: "no-store" },
  );
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GitHub report list failed: ${response.status}`);
  const items = (await response.json()) as GithubContent[];
  const paths = items
    .filter((item) => item.type === "file" && /^\d{4}-\d{2}-\d{2}\.json$/.test(item.name ?? ""))
    .sort((left, right) => (right.name ?? "").localeCompare(left.name ?? ""))
    .slice(0, limit)
    .map((item) => item.path)
    .filter((path): path is string => Boolean(path));
  const reports = await Promise.all(paths.map((path) => fetchStoredReport(path)));
  return reports
    .filter((report): report is DailySeoReport => report !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export async function readReportHistory(limit = 14) {
  const safeLimit = Number.isInteger(limit) ? Math.min(90, Math.max(1, limit)) : 14;
  const bundled = await readBundledReportHistory(safeLimit);
  const { token } = githubConfig();
  if (!token) return bundled;
  try {
    const remote = await readRemoteReportHistory(safeLimit, token);
    const merged = new Map<string, DailySeoReport>();
    for (const report of bundled) merged.set(report.date, report);
    for (const report of remote) merged.set(report.date, report);
    return [...merged.values()]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-safeLimit);
  } catch {
    return bundled;
  }
}

export async function readLatestReport() {
  const reports = await readReportHistory(1);
  return reports.at(-1) ?? null;
}

export async function persistReport(report: DailySeoReport) {
  const { token, repository, branch } = githubConfig();
  if (!token) {
    return {
      persisted: false,
      reason: "github_token_not_configured",
      repository,
    };
  }

  const path = `data/reports/${report.date}.json`;
  const endpoint = `https://api.github.com/repos/${repository}/contents/${path}`;
  const requestHeaders = headers(token);
  const existingResponse = await githubFetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, {
    headers: requestHeaders,
    cache: "no-store",
  });
  let existing: GithubContent = {};
  if (existingResponse.ok) existing = (await existingResponse.json()) as GithubContent;
  if (!existingResponse.ok && existingResponse.status !== 404) {
    throw new Error(`GitHub report lookup failed: ${existingResponse.status}`);
  }

  const response = await githubFetch(endpoint, {
    method: "PUT",
    headers: { ...requestHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: `data: daily SEO report ${report.date}`,
      content: Buffer.from(`${JSON.stringify(report, null, 2)}\n`).toString("base64"),
      branch,
      ...(existing.sha ? { sha: existing.sha } : {}),
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub report write failed: ${response.status}`);
  return {
    persisted: true,
    path,
    repository,
    draftIncluded: Boolean(report.draft),
  };
}
