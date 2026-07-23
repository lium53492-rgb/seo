import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DailySeoReport } from "./types";

type GithubContent = {
  sha?: string;
  content?: string;
  encoding?: string;
  name?: string;
  path?: string;
  type?: string;
};

const DEFAULT_REPORTS_REPO = "lium53492-rgb/seo";
const githubRequestTimeoutMs = 5_000;
const reportModes = new Set(["disconnected", "live", "partial"]);
const intents = new Set(["commercial", "informational", "navigational", "transactional", "mixed"]);
const recommendedActions = new Set(["create_page", "improve_page", "consolidate", "observe"]);
const priorities = new Set(["P0", "P1", "P2"]);
const integrationStates = new Set(["connected", "configured", "replaced", "missing", "error"]);
const metricSources = new Set(["search_console", "vercel_analytics", "seo_redirect", "product_analytics", "payments"]);
const ctaLocations = new Set(["seo_page", "header", "final_cta", "companion"]);
const safeRepository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const safeBranch = /^[A-Za-z0-9._/-]+$/;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function isOpportunity(value: unknown) {
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
    isString(value.reason);
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

function isMetricRecord(value: unknown, isAllowedKey: (key: string) => boolean) {
  return isRecord(value) && Object.entries(value).every(([key, metric]) =>
    isAllowedKey(key) && isFiniteMetric(metric));
}

function isGrowthPortfolio(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
    value.periodBasis !== "complete_shanghai_calendar_days" ||
    value.aggregationKey !== "source_slug+reporting_period" ||
    value.conversionJoinKey !== "seo_click_id" ||
    !isString(value.generatedAt) || !Number.isFinite(Date.parse(value.generatedAt)) ||
    !isString(value.periodStart) || !Number.isFinite(Date.parse(value.periodStart)) ||
    !isString(value.periodEnd) || !Number.isFinite(Date.parse(value.periodEnd)) ||
    Date.parse(value.periodStart) >= Date.parse(value.periodEnd) ||
    Date.parse(value.periodEnd) > Date.parse(value.generatedAt) ||
    !isRecord(value.summary) ||
    !Number.isInteger(value.summary.publishedPages) || Number(value.summary.publishedPages) < 0 ||
    !Number.isInteger(value.summary.collectedPages) || Number(value.summary.collectedPages) < 0 ||
    !Number.isInteger(value.summary.unavailablePages) || Number(value.summary.unavailablePages) < 0 ||
    !Array.isArray(value.entries)) return false;

  const slugs = new Set<string>();
  let collectedPages = 0;
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
      entry.report.sourceSlug !== entry.sourceSlug || !isFunnel(entry.report.funnel) ||
      entry.report.funnel.periodStart !== value.periodStart ||
      entry.report.funnel.periodEnd !== value.periodEnd ||
      !isNullableMetric(entry.report.pageviews) ||
      !isNullableMetric(entry.report.outboundRequests) ||
      !isNullableMetric(entry.report.purchaseEvents) ||
      !isNullableMetric(entry.report.orphanCallbacks) ||
      !isMetricRecord(entry.report.revenueByCurrency, (key) => /^[A-Z]{3}$/.test(key)) ||
      !isMetricRecord(entry.report.ctaLocations, (key) => ctaLocations.has(key))) return false;
    collectedPages += 1;
  }
  return value.summary.publishedPages === value.entries.length &&
    value.summary.collectedPages === collectedPages &&
    value.summary.unavailablePages === value.entries.length - collectedPages;
}

function isPortfolioDecision(value: unknown) {
  return isRecord(value) &&
    value.schemaVersion === 1 &&
    isString(value.action) && recommendedActions.has(value.action) &&
    (value.targetSlug === null || isString(value.targetSlug)) &&
    isString(value.rationale) &&
    isStringArray(value.evidenceSlugs) &&
    new Set(value.evidenceSlugs).size === value.evidenceSlugs.length;
}

function isBrief(value: unknown) {
  if (value === null) return true;
  return isRecord(value) && isString(value.keyword) && isString(value.slug) &&
    isString(value.pageType) && isString(value.searchIntent) && intents.has(value.searchIntent) &&
    isString(value.title) && isString(value.description) && isString(value.h1) &&
    isString(value.primaryCta) && isStringArray(value.sections) &&
    isStringArray(value.evidenceRequired) && isStringArray(value.qualityGate);
}

function isDraft(value: unknown) {
  if (value === null) return true;
  return isRecord(value) && isString(value.keyword) && isString(value.slug) &&
    value.language === "en" && isString(value.model) &&
    isString(value.generatedAt) && Number.isFinite(Date.parse(value.generatedAt)) &&
    (value.status === "ready_for_review" || value.status === "blocked") &&
    value.reviewRequired === true && isString(value.title) && isString(value.metaDescription) &&
    isString(value.h1) && isString(value.heroMarkdown) && isString(value.primaryCta) &&
    Array.isArray(value.sections) && value.sections.every((section) =>
      isRecord(section) && isString(section.heading) && isString(section.bodyMarkdown)) &&
    Array.isArray(value.faqs) && value.faqs.every((faq) =>
      isRecord(faq) && isString(faq.question) && isString(faq.answerMarkdown)) &&
    isStringArray(value.factIdsUsed) &&
    Array.isArray(value.internalLinks) && value.internalLinks.every((link) =>
      isRecord(link) && isString(link.anchor) && isString(link.href)) &&
    isStringArray(value.assetBriefs) && isRecord(value.quality) &&
    typeof value.quality.passed === "boolean" && isFiniteMetric(value.quality.wordCount) &&
    Array.isArray(value.quality.checks) && value.quality.checks.every((check) =>
      isRecord(check) && isString(check.id) && isString(check.label) &&
      typeof check.passed === "boolean" && isString(check.detail));
}

function parseReport(raw: string, source: string): DailySeoReport {
  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value) ||
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
    !Array.isArray(value.opportunities) || !value.opportunities.every(isOpportunity) ||
    !Array.isArray(value.performance) || !value.performance.every(isPerformance) ||
    !Array.isArray(value.actions) || !value.actions.every(isAction) ||
    !isBrief(value.brief) || !isDraft(value.draft) ||
    (value.drafts !== undefined && (!Array.isArray(value.drafts) || !value.drafts.every(isDraft))) ||
    (value.funnel !== undefined && !isFunnel(value.funnel)) ||
    (value.portfolioFunnels !== undefined && !isGrowthPortfolio(value.portfolioFunnels)) ||
    (value.portfolioDecision !== undefined && !isPortfolioDecision(value.portfolioDecision)) ||
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

async function readBundledLatestReport() {
  const reportsDirectory = resolve(process.cwd(), "data/reports");
  try {
    const latest = (await readdir(reportsDirectory))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort((left, right) => right.localeCompare(left))[0];
    if (!latest) return null;
    const path = resolve(reportsDirectory, latest);
    return parseReport(await readFile(path, "utf8"), path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readReportHistory(limit = 14) {
  const safeLimit = Number.isInteger(limit) ? Math.min(90, Math.max(1, limit)) : 14;
  const reportsDirectory = resolve(process.cwd(), "data/reports");
  try {
    const names = (await readdir(reportsDirectory))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, safeLimit)
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

export async function readLatestReport() {
  const bundled = await readBundledLatestReport();
  const { token, repository, branch } = githubConfig();
  if (!token) return bundled;
  try {
    const response = await githubFetch(
      `https://api.github.com/repos/${repository}/contents/data/reports?ref=${encodeURIComponent(branch)}`,
      { headers: headers(token), cache: "no-store" },
    );
    if (response.status === 404) return bundled;
    if (!response.ok) {
      if (bundled) return bundled;
      throw new Error(`GitHub report list failed: ${response.status}`);
    }
    const items = (await response.json()) as GithubContent[];
    const latest = items
      .filter((item) => item.type === "file" && /^\d{4}-\d{2}-\d{2}\.json$/.test(item.name ?? ""))
      .sort((left, right) => (right.name ?? "").localeCompare(left.name ?? ""))[0];
    const remote = latest?.path ? await fetchStoredReport(latest.path) : null;
    if (!remote) return bundled;
    if (!bundled) return remote;
    return remote.date >= bundled.date ? remote : bundled;
  } catch (error) {
    if (bundled) return bundled;
    throw error;
  }
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
