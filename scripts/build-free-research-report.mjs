import "./load-env.mjs";

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { scoreResearchCandidate } from "./lib/seo-policy.mjs";
import { audienceDraftBlockers } from "../lib/seo/audience-policy.mjs";
import { assertOriginalIpBoundary } from "../lib/seo/ip-boundary.mjs";
import { validatePageArchitecture, validateSeoArchitectureBridge } from "../lib/seo/content-contract.mjs";
import {
  analyzeContentNovelty,
  visiblePageText,
} from "../lib/seo/content-similarity.mjs";
import { publishedArchitectureHistoryFromReports } from "../lib/seo/content-history.mjs";
import {
  hasExplicitMarkdownList,
  unsupportedMarkdownReason,
} from "../lib/seo/markdown-semantics.mjs";
import {
  analyzeCandidateIntentBatch,
  findPublishedIntentMatch,
  publishedIntentRecords,
} from "./lib/intent-similarity.mjs";
import {
  evaluateConsolidationEvidence,
  evaluateGrowthFeedbackGate,
  projectPrivateGrowthReport,
} from "./lib/growth-portfolio.mjs";
import {
  isQualifyingGoogleTrendsSignal,
  validateGoogleTrendsEvidence,
} from "../lib/seo/google-trends-contract.mjs";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: npm run research:build -- data/research/YYYY-MM-DD.json");

const readJson = (path) => JSON.parse(readFileSync(resolve(path), "utf8"));
const input = readJson(inputPath);
const policy = readJson("data/config/seo-policy.json");
const factCatalog = readJson("data/config/product-facts.json");
const architecturePolicy = readJson("data/config/content-architecture.json");
const presentationCatalog = readJson("data/config/presentation-recipes.json");
const unattendedPolicy = readJson("data/config/unattended-publishing.json");
const siteConfig = readJson("data/config/site.json");
const date = String(input.date || "");
const requireBigQueryTrends = date >=
  policy.googleTrends.automatedCollectionEnforcedFromReportDate;
const trendsAttestationVerificationKey = String(
  process.env.GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY || "",
).replace(/\\n/g, "\n").trim();
const trendsAttestationClientEmail = String(
  process.env.GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL || "",
).trim();
const retiredPageSlugs = new Set(Array.isArray(policy.retiredPageSlugs) ? policy.retiredPageSlugs : []);
const retiredRecipeIds = new Set(Array.isArray(policy.retiredRecipeIds) ? policy.retiredRecipeIds : []);
const retiredPaletteIds = new Set(Array.isArray(policy.retiredPaletteIds) ? policy.retiredPaletteIds : []);

validateSeoArchitectureBridge(policy, architecturePolicy);

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
if (Number(input.policyVersion) !== policy.policyVersion) {
  throw new Error(`Research must use policyVersion ${policy.policyVersion}`);
}

function shanghaiCalendarDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

const contentStrategy = input.contentStrategy || null;
if (contentStrategy?.schemaVersion !== 2) {
  throw new Error("Content strategy must use schemaVersion 2");
}
if (!architecturePolicy.painPointIds.includes(contentStrategy.painPointId)) {
  throw new Error("Content strategy needs an approved painPointId");
}
const requiredStrategyFields = [
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
for (const field of requiredStrategyFields) {
  if (typeof contentStrategy?.[field] !== "string" || contentStrategy[field].trim().length < 20) {
    throw new Error(`Content strategy needs a specific ${field}`);
  }
}
if (!policy.allowedPagePatterns.includes(contentStrategy.pagePattern)) {
  throw new Error("Content strategy needs an approved pagePattern");
}
if (!["qualified_outbound_click", "trial_start", "purchase"].includes(contentStrategy.primaryConversion)) {
  throw new Error("Content strategy needs a measurable primaryConversion");
}

const minimumDailyCandidates = Math.max(policy.candidateCount.min, unattendedPolicy.candidateBatchSize.min);
const maximumDailyCandidates = Math.min(policy.candidateCount.max, unattendedPolicy.candidateBatchSize.max);
if (!Array.isArray(input.candidates) || input.candidates.length < minimumDailyCandidates || input.candidates.length > maximumDailyCandidates) {
  throw new Error(`Research requires ${minimumDailyCandidates}-${maximumDailyCandidates} candidates`);
}
if (!Array.isArray(input.evidence) || input.evidence.length < policy.evidence.minLinks) {
  throw new Error(`Research requires at least ${policy.evidence.minLinks} evidence links`);
}

const slugify = (value) => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const titleCase = (value) => String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
const safeEvidenceId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const approvedFactIds = new Set(factCatalog.facts.map((fact) => fact.id));
const forbiddenClaims = factCatalog.forbiddenClaimPatterns.map((pattern) => new RegExp(pattern, "i"));
const unsupportedKeywords = factCatalog.unsupportedKeywordPatterns.map((pattern) => new RegExp(pattern, "i"));
const allowedCtaLocations = new Set(["seo_page", "hero", "header", "inline", "final_cta", "companion"]);

function validatedCtaLocation(location) {
  if (!allowedCtaLocations.has(location)) {
    throw new Error(`Growth entry has an unknown CTA location: ${location}`);
  }
  return location;
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

function normalizeBreakoutEvidence(item, evidenceId) {
  let sourceUrl;
  try {
    sourceUrl = new URL(item.url);
  } catch {
    throw new Error(`Breakout-page evidence needs a valid independent source URL: ${evidenceId}`);
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
    throw new Error(`Breakout-page evidence needs a page-specific independent HTTP(S) source URL: ${evidenceId}`);
  }
  const collectedAt = String(item.collectedAt || "");
  if (
    !Number.isFinite(Date.parse(collectedAt)) ||
    shanghaiCalendarDate(collectedAt) !== date
  ) {
    throw new Error(`Breakout-page evidence must be collected on the report's Shanghai date: ${evidenceId}`);
  }
  const signal = item.signal;
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
    throw new Error(`Breakout-page evidence needs a structured signal: ${evidenceId}`);
  }
  const allowedSignalFields = new Set(["type", "value", "unit", "basis", "detail"]);
  const unknownSignalField = Object.keys(signal).find((field) => !allowedSignalFields.has(field));
  if (unknownSignalField) {
    throw new Error(`Breakout-page signal has an unknown field ${unknownSignalField}: ${evidenceId}`);
  }
  const type = String(signal.type || "").trim();
  const value = signal.value;
  const unit = String(signal.unit || "").trim();
  const basis = String(signal.basis || "").trim();
  const detail = String(signal.detail || "").trim();
  if (!breakoutEvidencePolicy.allowedSignalTypes.includes(type)) {
    throw new Error(`Breakout-page signal has an unsupported type: ${evidenceId}`);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Breakout-page signal needs a positive finite numeric value: ${evidenceId}`);
  }
  if (!unit || unit.length > 64) {
    throw new Error(`Breakout-page signal needs a concise unit: ${evidenceId}`);
  }
  if (basis.length < breakoutEvidencePolicy.minBasisChars) {
    throw new Error(`Breakout-page signal basis is too short: ${evidenceId}`);
  }
  if (detail.length < breakoutEvidencePolicy.minDetailChars) {
    throw new Error(`Breakout-page signal detail is too short: ${evidenceId}`);
  }
  return {
    kind: breakoutEvidencePolicy.requiredKind,
    sourceUrl: sourceUrl.toString(),
    collectedAt,
    supports: Array.isArray(item.supports)
      ? item.supports.map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean)
      : [],
    signal: { type, value, unit, basis, detail },
  };
}

function assertSelectedCreateBreakoutEvidence(selectedKeyword, normalizedEvidence) {
  if (date < breakoutEvidencePolicy.enforcedFromReportDate) return;
  const keyword = String(selectedKeyword || "").trim().toLowerCase();
  const qualifying = normalizedEvidence.some((item) => item.supports.includes(keyword));
  if (!qualifying) {
    throw new Error(
      `Create-page breakout evidence gate failed: selected keyword ${keyword || "<empty>"} needs at least one ` +
      `same-day, page-specific independent ${breakoutEvidencePolicy.requiredKind} record with a structured supported signal`,
    );
  }
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isValidPerformanceUrl(value) {
  if (value.startsWith("/")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

const evidenceDomains = new Set();
const supportedKeywords = new Set();
const evidenceById = new Map();
const evidenceDomainById = new Map();
const normalizedBreakoutEvidenceById = new Map();
for (const item of input.evidence) {
  const evidenceId = String(item.id || "").trim();
  if (!safeEvidenceId.test(evidenceId) || evidenceById.has(evidenceId)) {
    throw new Error(`Every evidence item needs a unique safe id: ${evidenceId || "<empty>"}`);
  }
  const url = new URL(item.url);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Evidence URLs must use HTTP(S)");
  if (!String(item.title || "").trim() || !String(item.source || "").trim()) {
    throw new Error("Every evidence item needs a title and source");
  }
  if (!Number.isFinite(Date.parse(item.collectedAt || ""))) {
    throw new Error(`Evidence needs a valid collectedAt timestamp: ${item.url}`);
  }
  const domain = registrableDomain(url.hostname);
  evidenceDomains.add(domain);
  evidenceById.set(evidenceId, item);
  evidenceDomainById.set(evidenceId, domain);
  if (item.kind === breakoutEvidencePolicy.requiredKind) {
    normalizedBreakoutEvidenceById.set(
      evidenceId,
      normalizeBreakoutEvidence(item, evidenceId),
    );
  }
  for (const keyword of Array.isArray(item.supports) ? item.supports : []) {
    supportedKeywords.add(String(keyword).trim().toLowerCase());
  }
}

function assertSelectedCreateTrendReadiness(selectedDraftKeyword, signals, collection) {
  const keyword = String(selectedDraftKeyword || "").trim().toLowerCase();
  const requireBigQuery = requireBigQueryTrends;
  const qualifyingSignal = signals.find((signal) =>
    isQualifyingGoogleTrendsSignal(signal, {
      selectedKeyword: keyword,
      reportDate: date,
      trendCollection: collection,
      requireBigQuery,
      attestationVerificationKey: trendsAttestationVerificationKey,
      expectedAttestationClientEmail: trendsAttestationClientEmail,
    }));
  if (!qualifyingSignal) {
    const requiredEvidence = requireBigQuery
      ? "official same-day BigQuery collection with an exact top_rising_terms match"
      : "official same-day observation: Explore direction=rising/relativeInterest>=50 or an exact " +
        "BigQuery top_rising_terms match";
    throw new Error(
      `Create-page Google Trends gate failed: selected draft ${keyword || "<empty>"} needs an ` +
      requiredEvidence,
    );
  }
}

function readUnconsumedFeedback() {
  const inboxDirectory = resolve("data/seo-feedback/inbox");
  if (!existsSync(inboxDirectory)) return [];
  return readdirSync(inboxDirectory)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .flatMap((name) => {
      const document = readJson(resolve(inboxDirectory, name));
      const inboxDate = name.slice(0, 10);
      if (document.date !== inboxDate || !Array.isArray(document.entries)) {
        throw new Error(`Invalid workbench feedback inbox: ${name}`);
      }
      return document.entries
        .filter((entry) => !entry?.consumedAt)
        .map((entry) => {
          if (
            typeof entry?.id !== "string" ||
            !entry.id.trim() ||
            typeof entry.message !== "string" ||
            !entry.message.trim()
          ) {
            throw new Error(`Invalid unconsumed workbench feedback entry: ${name}`);
          }
          return {
            id: entry.id,
            date: inboxDate,
            message: entry.message,
          };
        });
    });
}

function validateFeedbackDecisions(rawDecisions, pendingFeedback) {
  if (rawDecisions === undefined && pendingFeedback.length === 0) return [];
  if (rawDecisions === undefined) {
    throw new Error(
      `feedbackDecisions must cover all ${pendingFeedback.length} unconsumed workbench entries`,
    );
  }
  if (!Array.isArray(rawDecisions)) {
    throw new Error("feedbackDecisions must be an array covering every unconsumed workbench entry");
  }
  if (rawDecisions.length !== pendingFeedback.length) {
    throw new Error(
      `feedbackDecisions must cover all ${pendingFeedback.length} unconsumed workbench entries`,
    );
  }
  const expected = new Map(
    pendingFeedback.map((entry) => [`${entry.date}|${entry.id}`, entry]),
  );
  const seen = new Set();
  return rawDecisions.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`feedbackDecisions[${index}] must be an object`);
    }
    const allowedFields = new Set(["id", "date", "message", "decision", "rationale"]);
    const unknownField = Object.keys(item).find((field) => !allowedFields.has(field));
    if (unknownField) {
      throw new Error(`feedbackDecisions[${index}] has an unknown field: ${unknownField}`);
    }
    const id = String(item.id || "");
    const feedbackDate = String(item.date || "");
    const identity = `${feedbackDate}|${id}`;
    const source = expected.get(identity);
    if (!source || seen.has(identity)) {
      throw new Error(`feedbackDecisions[${index}] does not match one unique unconsumed entry`);
    }
    if (item.message !== source.message) {
      throw new Error(`feedbackDecisions[${index}] must preserve the feedback message verbatim`);
    }
    if (!["adopted", "rejected"].includes(item.decision)) {
      throw new Error(`feedbackDecisions[${index}] needs adopted or rejected`);
    }
    const rationale = String(item.rationale || "").trim();
    if (rationale.length < 20) {
      throw new Error(`feedbackDecisions[${index}] needs a specific rationale`);
    }
    seen.add(identity);
    return {
      id,
      date: feedbackDate,
      message: source.message,
      decision: item.decision,
      rationale,
    };
  });
}

const candidateKeywords = input.candidates.map((candidate) => String(candidate.keyword || "").trim().toLowerCase());
if (new Set(candidateKeywords).size !== candidateKeywords.length) {
  throw new Error("Research candidates must use unique keywords");
}
const candidateSearcherJobs = input.candidates.map((candidate) =>
  String(candidate?.decisionEvidence?.searcherJob || "").trim().toLowerCase());
if (candidateSearcherJobs.some((job) => !job) ||
  new Set(candidateSearcherJobs).size !== candidateSearcherJobs.length) {
  throw new Error("Research candidates must use distinct non-empty searcher jobs");
}
const requiredDistinctIntents = policy.dailyPageLimit + unattendedPolicy.minimumFallbackIntents;
const candidateIntentBatch = analyzeCandidateIntentBatch(input.candidates);
if (candidateIntentBatch.distinctCount < requiredDistinctIntents) {
  const example = candidateIntentBatch.collisions[0];
  const duplicateDetail = example
    ? ` Near-duplicate candidates: "${example.left.keyword}" and "${example.right.keyword}".`
    : "";
  throw new Error(
    `Research requires at least ${requiredDistinctIntents} semantically distinct candidate intents ` +
    `(${unattendedPolicy.minimumFallbackIntents} distinct fallbacks after today's page); ` +
    `found ${candidateIntentBatch.distinctCount}.${duplicateDetail}`,
  );
}
if (candidateIntentBatch.distinctCount - policy.dailyPageLimit < unattendedPolicy.minimumFallbackIntents) {
  throw new Error(`Research must retain at least ${unattendedPolicy.minimumFallbackIntents} fallback intents`);
}
const validatedTrends = validateGoogleTrendsEvidence({
  trendSignals: input.trendSignals ?? [],
  trendCollection: input.trendCollection,
  candidateKeywords,
  reportDate: date,
  attestationVerificationKey: requireBigQueryTrends
    ? trendsAttestationVerificationKey
    : undefined,
  expectedAttestationClientEmail: requireBigQueryTrends
    ? trendsAttestationClientEmail
    : undefined,
  requireVerifiedAttestation: requireBigQueryTrends,
});
const trendSignals = validatedTrends.trendSignals;
const trendCollection = validatedTrends.trendCollection;
const feedbackDecisions = validateFeedbackDecisions(
  input.feedbackDecisions,
  readUnconsumedFeedback(),
);
if (evidenceDomains.size < policy.evidence.minDomains) {
  throw new Error(`Evidence must come from at least ${policy.evidence.minDomains} independent domains`);
}
for (const candidate of input.candidates) {
  const keyword = String(candidate.keyword || "").trim().toLowerCase();
  if (!keyword || !supportedKeywords.has(keyword)) {
    throw new Error(`Missing evidence support for candidate: ${keyword || "<empty>"}`);
  }
}

function existingPages() {
  const directory = resolve("data/pages");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(resolve(directory, name)))
    .filter((page) => page.status === "published");
}

function existingReports() {
  const directory = resolve("data/reports");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(resolve(directory, name)));
}

function readPortfolioInput() {
  if (input.portfolioFunnels && input.portfolioSnapshot) {
    throw new Error("Use either embedded portfolioFunnels or portfolioSnapshot, not both");
  }
  if (input.portfolioFunnels) return input.portfolioFunnels;
  if (typeof input.portfolioSnapshot !== "string" || !input.portfolioSnapshot.trim()) {
    throw new Error("Research must include a current all-page growth portfolio snapshot");
  }
  const growthDirectory = resolve("data/growth");
  const portfolioPath = resolve(input.portfolioSnapshot);
  const relativePath = relative(growthDirectory, portfolioPath);
  if (!relativePath || relativePath.startsWith("..") || resolve(growthDirectory, relativePath) !== portfolioPath) {
    throw new Error("portfolioSnapshot must resolve inside data/growth");
  }
  return readJson(portfolioPath);
}

function validateDraft(rawDraft, keyword) {
  if (!rawDraft) return null;
  if (String(rawDraft.keyword || "").trim().toLowerCase() !== keyword) {
    throw new Error(`Draft keyword must match its researched opportunity: ${keyword}`);
  }
  if (rawDraft.language !== "en" || rawDraft.reviewRequired !== true) {
    throw new Error("Draft must be English and require editorial review");
  }
  if (
    typeof rawDraft.model !== "string" ||
    rawDraft.model.trim().length < 2 ||
    typeof rawDraft.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(rawDraft.generatedAt))
  ) {
    throw new Error("Draft must record its generation model and timestamp");
  }
  if (
    shanghaiCalendarDate(rawDraft.generatedAt) !== date ||
    (
      Number.isFinite(Date.parse(input.generatedAt || "")) &&
      Date.parse(rawDraft.generatedAt) > Date.parse(input.generatedAt)
    )
  ) {
    throw new Error("Draft generatedAt must belong to the report date and not follow report generation");
  }
  const factIds = Array.isArray(rawDraft.factIdsUsed) ? rawDraft.factIdsUsed : [];
  if (new Set(factIds).size < 2 || new Set(factIds).size !== factIds.length ||
    factIds.some((id) => !approvedFactIds.has(id))) {
    throw new Error("Draft uses an unapproved or missing product fact ID");
  }
  const sections = Array.isArray(rawDraft.sections) ? rawDraft.sections : [];
  const faqs = Array.isArray(rawDraft.faqs) ? rawDraft.faqs : [];
  if (sections.length < policy.content.minSections || faqs.length < policy.content.minFaqs) {
    throw new Error(`Draft needs at least ${policy.content.minSections} sections and ${policy.content.minFaqs} FAQs`);
  }
  for (const [field, minimum] of [["title", 20], ["metaDescription", 70], ["h1", 5], ["heroMarkdown", 80], ["primaryCta", 5]]) {
    if (typeof rawDraft[field] !== "string" || rawDraft[field].trim().length < minimum) {
      throw new Error(`Draft needs a specific ${field}`);
    }
  }
  const enhancedContentRequired = date >= architecturePolicy.enhancedNoveltyEnforcedFromReportDate;
  const audienceBlockers = audienceDraftBlockers({
    policy,
    reportDate: date,
    keyword,
    h1: rawDraft.h1,
    factIds,
    architecture: rawDraft.architecture,
    visibleText: visiblePageText(rawDraft),
  });
  if (audienceBlockers.length) {
    throw new Error(`Draft violates the D&D-first audience contract: ${audienceBlockers.join("; ")}`);
  }
  const genericCtaPattern = /^(?:click here|learn more|get started|explore stories|explore story-led roleplay|try novelai|start now|read more)(?:\s+(?:on|with)\s+novelai)?[.!]?$/i;
  const ctaTokens = new Set(
    `${keyword} ${contentStrategy?.readerOutcome || ""} ${contentStrategy?.primaryPainPoint || ""}`
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length >= 5 && !["novelai", "story", "stories", "roleplay", "using", "about"].includes(token)) || [],
  );
  const ctaSpecific = !genericCtaPattern.test(rawDraft.primaryCta.trim()) &&
    [...ctaTokens].some((token) => rawDraft.primaryCta.toLowerCase().includes(token));
  if (enhancedContentRequired && !ctaSpecific) {
    throw new Error("Draft primaryCta must name this page's specific outcome; generic CTA copy is not publishable");
  }
  if (sections.some((section) => typeof section?.heading !== "string" || typeof section?.bodyMarkdown !== "string") ||
    faqs.some((faq) => typeof faq?.question !== "string" || typeof faq?.answerMarkdown !== "string")) {
    throw new Error("Every draft section and FAQ needs visible text");
  }
  let markdownRenderable = true;
  if (enhancedContentRequired) {
    const plainTextValues = [
      ["title", rawDraft.title],
      ["metaDescription", rawDraft.metaDescription],
      ["h1", rawDraft.h1],
      ["primaryCta", rawDraft.primaryCta],
      ...sections.map((section, index) => [`section ${index + 1} heading`, section.heading]),
      ...faqs.map((faq, index) => [`FAQ ${index + 1} question`, faq.question]),
      ...Object.entries(rawDraft.architecture?.presentation?.surfaceCopy || {}).map(([field, value]) => [`surfaceCopy.${field}`, value]),
      ["signature title", rawDraft.signatureModule?.title],
      ...(rawDraft.signatureModule?.items || []).flatMap((item, index) => [
        [`signature item ${index + 1} label`, item.label],
        [`signature item ${index + 1} title`, item.title],
      ]),
    ];
    const richTextValues = [
      ["heroMarkdown", rawDraft.heroMarkdown],
      ...sections.map((section, index) => [`section ${index + 1} bodyMarkdown`, section.bodyMarkdown]),
      ...faqs.map((faq, index) => [`FAQ ${index + 1} answerMarkdown`, faq.answerMarkdown]),
      ["signature intro", rawDraft.signatureModule?.intro],
      ...(rawDraft.signatureModule?.items || []).map((item, index) => [`signature item ${index + 1} bodyMarkdown`, item.bodyMarkdown]),
    ];
    const invalidPlain = plainTextValues.find(([, value]) => unsupportedMarkdownReason(value, { plainText: true }));
    const invalidRich = richTextValues.find(([, value]) => unsupportedMarkdownReason(value));
    const unmarkedList = sections.find((section) =>
      ["steps", "checklist", "examples", "comparison"].includes(section.format) &&
      !hasExplicitMarkdownList(section.bodyMarkdown));
    markdownRenderable = !invalidPlain && !invalidRich && !unmarkedList;
    if (invalidPlain || invalidRich) {
      const [label, value] = invalidPlain || invalidRich;
      throw new Error(`Draft ${label} uses unsupported Markdown: ${unsupportedMarkdownReason(value, { plainText: Boolean(invalidPlain) })}`);
    }
    if (unmarkedList) {
      throw new Error(`Draft section ${unmarkedList.id || unmarkedList.heading} must use explicit Markdown list markers for ${unmarkedList.format}`);
    }
  }
  const publishableText = visiblePageText(rawDraft);
  assertOriginalIpBoundary({
    policy,
    reportDate: date,
    draftSchemaVersion: rawDraft.schemaVersion,
    ipBoundary: rawDraft.ipBoundary,
    visibleText: `${rawDraft.keyword || ""} ${publishableText}`,
  });
  const failedClaim = forbiddenClaims.find((pattern) => pattern.test(publishableText));
  if (failedClaim) throw new Error(`Draft contains an unsupported product claim: ${failedClaim}`);
  const wordCount = (publishableText.match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
  const suppliedChecks = Array.isArray(rawDraft.quality?.checks) ? rawDraft.quality.checks : [];
  const automatedChecks = [
    { id: "approved-facts", label: "Uses approved product facts", passed: true, detail: `${factIds.length} approved fact IDs` },
    { id: "content-structure", label: "Has required sections and FAQs", passed: sections.length >= policy.content.minSections && faqs.length >= policy.content.minFaqs, detail: `${sections.length} sections; ${faqs.length} FAQs` },
    { id: "conversion-path", label: "Has a concrete CTA", passed: rawDraft.primaryCta.trim().length >= 5, detail: rawDraft.primaryCta.trim() },
    { id: "cta-specificity", label: "CTA names the page-specific outcome", passed: !enhancedContentRequired || ctaSpecific, detail: enhancedContentRequired ? rawDraft.primaryCta.trim() : "Enhanced CTA gate starts with 2026-08-11 reports" },
    { id: "markdown-renderability", label: "Copy uses only production-supported Markdown", passed: markdownRenderable, detail: enhancedContentRequired ? "Plain fields and rich text match the renderer subset; list formats use explicit markers" : "Enhanced Markdown gate starts with 2026-08-11 reports" },
    { id: "minimum-depth", label: `${policy.content.minWords}-${policy.content.maxWords} English words`, passed: wordCount >= policy.content.minWords && wordCount <= policy.content.maxWords, detail: `${wordCount} words` },
  ];
  const automatedIds = new Set(automatedChecks.map((check) => check.id));
  const normalizedChecks = [...suppliedChecks.filter((check) => !automatedIds.has(check.id)), ...automatedChecks];
  const passed = normalizedChecks.every((check) => check.passed === true);
  return {
    ...rawDraft,
    status: passed ? "ready_for_review" : "blocked",
    reviewRequired: true,
    quality: { passed, wordCount, checks: normalizedChecks },
  };
}

const funnelMetricNames = [
  "organicClicks",
  "landingUv",
  "qualifiedOutboundClicks",
  "trialStarts",
  "signups",
  "paidConversions",
  "revenueMinor",
];
const allowedMetricSources = new Set(["search_console", "vercel_analytics", "first_party_analytics", "seo_redirect", "product_analytics", "payments"]);

function validateFunnel(rawFunnel) {
  const conversionJoinKey = rawFunnel?.conversionJoinKey ?? rawFunnel?.joinKey;
  if (!rawFunnel || rawFunnel.schemaVersion !== 1 || conversionJoinKey !== "seo_click_id") {
    throw new Error("Research must include a funnel snapshot whose conversionJoinKey is seo_click_id");
  }
  if (rawFunnel.aggregationKey && rawFunnel.aggregationKey !== "source_slug+reporting_period") {
    throw new Error("Funnel aggregates must use source_slug+reporting_period");
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(rawFunnel.periodStart) || !/^\d{4}-\d{2}-\d{2}/.test(rawFunnel.periodEnd)) {
    throw new Error("Funnel snapshot needs an explicit reporting period");
  }
  if (!Number.isFinite(Date.parse(rawFunnel.periodStart)) || !Number.isFinite(Date.parse(rawFunnel.periodEnd)) || Date.parse(rawFunnel.periodStart) >= Date.parse(rawFunnel.periodEnd)) {
    throw new Error("Funnel reporting period must use valid increasing timestamps");
  }
  const metrics = {};
  for (const name of funnelMetricNames) {
    const metric = rawFunnel.metrics?.[name];
    if (!metric || !["observed", "unavailable"].includes(metric.status) || !allowedMetricSources.has(metric.source)) {
      throw new Error(`Funnel metric ${name} needs status, source, and detail`);
    }
    if (typeof metric.detail !== "string" || metric.detail.trim().length < 10) {
      throw new Error(`Funnel metric ${name} needs a specific availability note`);
    }
    if (metric.status === "observed" && (!Number.isFinite(Number(metric.value)) || Number(metric.value) < 0)) {
      throw new Error(`Observed funnel metric ${name} needs a non-negative value`);
    }
    if (metric.status === "unavailable" && metric.value !== null) {
      throw new Error(`Unavailable funnel metric ${name} must use a null value`);
    }
    metrics[name] = { ...metric, value: metric.status === "observed" ? Number(metric.value) : null };
  }
  if (metrics.revenueMinor.status === "observed" && !/^[A-Z]{3}$/.test(rawFunnel.currency || "")) {
    throw new Error("Observed revenue needs a three-letter currency code");
  }
  const observedCount = Object.values(metrics).filter((metric) => metric.status === "observed").length;
  return {
    schemaVersion: 1,
    attributionStatus: observedCount === funnelMetricNames.length ? "connected" : observedCount ? "partial" : "unavailable",
    aggregationKey: "source_slug+reporting_period",
    conversionJoinKey: "seo_click_id",
    periodStart: rawFunnel.periodStart,
    periodEnd: rawFunnel.periodEnd,
    metrics,
    ...(rawFunnel.currency ? { currency: rawFunnel.currency } : {}),
  };
}

function nullableNonNegative(value, field) {
  if (value === null) return null;
  if (!Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new Error(`${field} must be null or a non-negative number`);
  }
  return Number(value);
}

function requiredNonNegative(value, field) {
  const normalized = nullableNonNegative(value, field);
  if (normalized === null) throw new Error(`${field} must be a non-negative number`);
  return normalized;
}

function validateSearchPerformance(value, sourceSlug) {
  if (
    !value ||
    !["observed", "unavailable"].includes(value.state) ||
    value.sourceSlug !== sourceSlug ||
    typeof value.pageUrl !== "string" ||
    !/^https:\/\//.test(value.pageUrl) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.startDate || "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.endDate || "") ||
    typeof value.detail !== "string" ||
    value.detail.trim().length < 20
  ) {
    throw new Error(`Growth entry has invalid Search Console provenance: ${sourceSlug}`);
  }
  let pageUrl;
  try {
    pageUrl = new URL(value.pageUrl);
  } catch {
    throw new Error(`Growth entry has invalid Search Console page URL: ${sourceSlug}`);
  }
  if (pageUrl.pathname.replace(/\/$/, "") !== `/${sourceSlug}`) {
    throw new Error(`Growth entry Search Console evidence is not for the exact page: ${sourceSlug}`);
  }
  const common = {
    state: value.state,
    sourceSlug,
    pageUrl: pageUrl.toString(),
    startDate: value.startDate,
    endDate: value.endDate,
  };
  if (value.state === "unavailable") {
    if ([value.clicks, value.impressions, value.ctr, value.position].some((metric) => metric !== null)) {
      throw new Error(`Unavailable Search Console metrics must stay null: ${sourceSlug}`);
    }
    return {
      ...common,
      clicks: null,
      impressions: null,
      ctr: null,
      position: null,
      detail: value.detail.trim(),
    };
  }
  const clicks = nullableNonNegative(value.clicks, "Search Console clicks");
  const impressions = nullableNonNegative(value.impressions, "Search Console impressions");
  const ctr = nullableNonNegative(value.ctr, "Search Console CTR");
  const position = nullableNonNegative(value.position, "Search Console position");
  if (clicks === null || impressions === null || ctr === null || ctr > 1) {
    throw new Error(`Observed Search Console metrics are incomplete: ${sourceSlug}`);
  }
  return {
    ...common,
    clicks,
    impressions,
    ctr,
    position,
    detail: value.detail.trim(),
  };
}

function normalizedPublicCanonical(value, pageUrl) {
  if (value === null) return null;
  try {
    const canonical = new URL(value);
    if (
      !["http:", "https:"].includes(canonical.protocol) ||
      canonical.origin !== pageUrl.origin
    ) {
      return null;
    }
    canonical.username = "";
    canonical.password = "";
    canonical.search = "";
    canonical.hash = "";
    return canonical.toString();
  } catch {
    return null;
  }
}

function validateUrlInspection(
  value,
  sourceSlug,
  fallbackInspectedAt,
  legacyPageUrl,
) {
  if (value === undefined) {
    if (legacyPageUrl === undefined) {
      throw new Error(`Growth entry is missing URL Inspection evidence: ${sourceSlug}`);
    }
    let pageUrl;
    try {
      pageUrl = new URL(legacyPageUrl);
    } catch {
      throw new Error(`Legacy growth entry has an invalid page URL: ${sourceSlug}`);
    }
    if (
      pageUrl.protocol !== "https:" ||
      pageUrl.username ||
      pageUrl.password ||
      pageUrl.search ||
      pageUrl.hash ||
      pageUrl.pathname.replace(/\/$/, "") !== `/${sourceSlug}`
    ) {
      throw new Error(`Legacy growth entry is not for the exact HTTPS page: ${sourceSlug}`);
    }
    return {
      state: "unavailable",
      sourceSlug,
      pageUrl: pageUrl.toString(),
      inspectedAt: fallbackInspectedAt,
      verdict: null,
      coverageState: null,
      robotsTxtState: null,
      indexingState: null,
      pageFetchState: null,
      lastCrawlTime: null,
      googleCanonical: null,
      userCanonical: null,
      crawledAs: null,
      sitemap: [],
      detail: "URL Inspection was not collected in this legacy growth snapshot.",
    };
  }
  if (
    !value ||
    !["observed", "unavailable"].includes(value.state) ||
    value.sourceSlug !== sourceSlug ||
    typeof value.pageUrl !== "string" ||
    !/^https:\/\//.test(value.pageUrl) ||
    !Number.isFinite(Date.parse(value.inspectedAt || "")) ||
    typeof value.detail !== "string" ||
    value.detail.trim().length < 20 ||
    !Array.isArray(value.sitemap) ||
    value.sitemap.some((item) => typeof item !== "string" || !/^https:\/\//.test(item))
  ) {
    throw new Error(`Growth entry has invalid URL Inspection provenance: ${sourceSlug}`);
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
  if (nullableFields.some((field) => value[field] !== null && typeof value[field] !== "string")) {
    throw new Error(`Growth entry has invalid URL Inspection fields: ${sourceSlug}`);
  }
  if (
    value.lastCrawlTime !== null &&
    !Number.isFinite(Date.parse(value.lastCrawlTime))
  ) {
    throw new Error(`Growth entry has invalid URL Inspection crawl time: ${sourceSlug}`);
  }
  if (
    value.state === "unavailable" &&
    (
      nullableFields.some((field) => value[field] !== null) ||
      value.sitemap.length > 0
    )
  ) {
    throw new Error(`Unavailable URL Inspection fields must stay empty: ${sourceSlug}`);
  }
  const pageUrl = new URL(value.pageUrl);
  if (pageUrl.pathname.replace(/\/$/, "") !== `/${sourceSlug}`) {
    throw new Error(`Growth entry URL Inspection is not for the exact page: ${sourceSlug}`);
  }
  const googleCanonical = normalizedPublicCanonical(value.googleCanonical, pageUrl);
  const userCanonical = normalizedPublicCanonical(value.userCanonical, pageUrl);
  if (
    value.state === "observed" &&
    [
      value.verdict,
      value.coverageState,
      value.robotsTxtState,
      value.indexingState,
      value.pageFetchState,
      value.lastCrawlTime,
      googleCanonical,
      userCanonical,
      value.crawledAs,
    ].every((field) => field === null)
  ) {
    throw new Error(`Observed URL Inspection needs a real decision field: ${sourceSlug}`);
  }
  return {
    state: value.state,
    sourceSlug,
    pageUrl: pageUrl.toString(),
    inspectedAt: value.inspectedAt,
    verdict: value.verdict,
    coverageState: value.coverageState,
    robotsTxtState: value.robotsTxtState,
    indexingState: value.indexingState,
    pageFetchState: value.pageFetchState,
    lastCrawlTime: value.lastCrawlTime,
    googleCanonical,
    userCanonical,
    crawledAs: value.crawledAs,
    sitemap: [],
    detail: value.detail.trim(),
  };
}

const persistedGrowthForbiddenKeys = new Set([
  "clickId",
  "cohort",
  "conversionJoinKey",
  "joinKey",
  "funnel",
  "organicClicks",
  "trialStarts",
  "signups",
  "paidConversions",
  "revenueMinor",
  "currency",
  "purchaseEvents",
  "orphanCallbacks",
  "revenueByCurrency",
  "pageviews",
  "outboundRequests",
  "ctaLocations",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findForbiddenGrowthKey(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenGrowthKey(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (persistedGrowthForbiddenKeys.has(key)) return key;
    const found = findForbiddenGrowthKey(child);
    if (found) return found;
  }
  return null;
}

function publicDecisionMetric(value, name, allowedSources) {
  const sources = Array.isArray(allowedSources) ? allowedSources : [allowedSources];
  if (
    !value ||
    !["observed", "unavailable"].includes(value.status) ||
    !sources.includes(value.source) ||
    typeof value.detail !== "string" ||
    value.detail.trim().length < 20
  ) {
    throw new Error(`Growth entry has invalid public ${name} evidence`);
  }
  const observed = value.status === "observed";
  const metricValue = observed ? requiredNonNegative(value.value, name) : null;
  if (!observed && value.value !== null) {
    throw new Error(`Unavailable public ${name} evidence must use a null value`);
  }
  const detail = name === "landingUv"
    ? observed
      ? value.source === "first_party_analytics"
        ? "Observed the exact landing page's aggregate estimated UV through privacy-minimized first-party analytics for this reporting period."
        : "Observed the exact landing page's aggregate UV through Vercel Web Analytics for this reporting period."
      : value.source === "first_party_analytics"
        ? "Exact-page landing UV was unavailable from first-party analytics for this reporting period."
        : "Exact-page landing UV was unavailable from Vercel Web Analytics for this reporting period."
    : observed
      ? "Observed the page-level qualified outbound aggregate through the private attribution service for this reporting period."
      : "The page-level qualified outbound aggregate was unavailable from the private attribution service for this reporting period.";
  return {
    status: observed ? "observed" : "unavailable",
    value: metricValue,
    source: value.source,
    detail,
  };
}

function publicPortfolioReport(rawReport, page, rawPortfolio) {
  if (!rawReport || rawReport.sourceSlug !== page.slug) {
    throw new Error(`Growth entry report does not match /${page.slug}`);
  }

  if (rawPortfolio.schemaVersion === 1) {
    const legacyFunnel = validateFunnel(rawReport.funnel);
    const legacySearchPerformance = validateSearchPerformance(
      rawReport.searchPerformance,
      page.slug,
    );
    if (
      legacyFunnel.periodStart !== rawPortfolio.periodStart ||
      legacyFunnel.periodEnd !== rawPortfolio.periodEnd
    ) {
      throw new Error(`Growth entry uses a mismatched reporting period: ${page.slug}`);
    }
    const projected = projectPrivateGrowthReport(
      {
        ...rawReport,
        funnel: legacyFunnel,
        searchPerformance: legacySearchPerformance,
        urlInspection: validateUrlInspection(
          rawReport.urlInspection,
          page.slug,
          rawPortfolio.generatedAt,
          legacySearchPerformance.pageUrl,
        ),
      },
      page,
      {
        periodStart: rawPortfolio.periodStart,
        periodEnd: rawPortfolio.periodEnd,
      },
    );
    return {
      ...projected,
      searchPerformance: validateSearchPerformance(projected.searchPerformance, page.slug),
      urlInspection: validateUrlInspection(
        projected.urlInspection,
        page.slug,
        rawPortfolio.generatedAt,
      ),
    };
  }

  const landingUv = publicDecisionMetric(
    rawReport.metrics?.landingUv,
    "landingUv",
    ["vercel_analytics", "first_party_analytics"],
  );
  const qualifiedOutboundClicks = publicDecisionMetric(
    rawReport.metrics?.qualifiedOutboundClicks,
    "qualifiedOutboundClicks",
    "seo_redirect",
  );
  const searchPerformance = validateSearchPerformance(rawReport.searchPerformance, page.slug);
  const urlInspection = validateUrlInspection(
    rawReport.urlInspection,
    page.slug,
    rawPortfolio.generatedAt,
  );
  const suppliedState = rawReport.decisionState;
  if (
    !suppliedState ||
    [
      "landingUvReady",
      "qualifiedOutboundReady",
      "searchPerformanceReady",
      "urlInspectionReady",
      "attributionJoinChecked",
      "attributionJoinBlocked",
      "samePageSearchValidated",
    ].some((name) => typeof suppliedState[name] !== "boolean") ||
    (suppliedState.attributionJoinBlocked && !suppliedState.attributionJoinChecked)
  ) {
    throw new Error(`Growth entry has invalid public decision state: ${page.slug}`);
  }
  const derivedState = {
    landingUvReady: landingUv.status === "observed",
    qualifiedOutboundReady: qualifiedOutboundClicks.status === "observed",
    searchPerformanceReady: searchPerformance.state === "observed",
    urlInspectionReady: urlInspection.state === "observed",
    attributionJoinChecked: suppliedState.attributionJoinChecked,
    attributionJoinBlocked: suppliedState.attributionJoinBlocked,
    samePageSearchValidated:
      landingUv.status === "observed" &&
      landingUv.value > 0 &&
      searchPerformance.state === "observed" &&
      Number(searchPerformance.impressions) > 0,
  };
  for (const [key, value] of Object.entries(derivedState)) {
    if (suppliedState[key] !== value) {
      throw new Error(`Growth entry has inconsistent public decision state: ${page.slug}`);
    }
  }
  return {
    sourceSlug: page.slug,
    metrics: { landingUv, qualifiedOutboundClicks },
    searchPerformance,
    urlInspection,
    decisionState: derivedState,
  };
}

function validatePortfolioSnapshot(rawPortfolio, publishedPages) {
  const legacySnapshot = rawPortfolio?.schemaVersion === 1;
  const publicSnapshot = rawPortfolio?.schemaVersion === 2;
  if (
    !rawPortfolio ||
    (!legacySnapshot && !publicSnapshot) ||
    (publicSnapshot && rawPortfolio.privacyClass !== "public_growth_evidence") ||
    rawPortfolio.periodBasis !== "complete_shanghai_calendar_days" ||
    rawPortfolio.reportingWindowDays !== Number(policy.feedbackLoop?.reportingWindowDays ?? 28) ||
    rawPortfolio.reportingLagDays !== Number(policy.feedbackLoop?.reportingLagDays ?? 3) ||
    rawPortfolio.aggregationKey !== "source_slug+reporting_period" ||
    (legacySnapshot && rawPortfolio.conversionJoinKey !== "seo_click_id")
  ) {
    throw new Error("Growth portfolio must use public schema v2 (or readable legacy v1), the configured reporting lag, and complete Shanghai days");
  }
  if (publicSnapshot) {
    const forbiddenKey = findForbiddenGrowthKey(rawPortfolio);
    if (forbiddenKey) {
      throw new Error(`Public growth schema v2 contains a forbidden private field: ${forbiddenKey}`);
    }
  }
  const generatedAt = Date.parse(rawPortfolio.generatedAt || "");
  const periodStart = Date.parse(rawPortfolio.periodStart || "");
  const periodEnd = Date.parse(rawPortfolio.periodEnd || "");
  if (
    !Number.isFinite(generatedAt) ||
    !Number.isFinite(periodStart) ||
    !Number.isFinite(periodEnd) ||
    periodStart >= periodEnd ||
    periodEnd > generatedAt
  ) {
    throw new Error("Growth portfolio needs a valid completed reporting period and generatedAt timestamp");
  }
  if (shanghaiCalendarDate(rawPortfolio.generatedAt) !== date) {
    throw new Error(`Growth portfolio must be collected on the report's Shanghai date: ${date}`);
  }
  if (!Array.isArray(rawPortfolio.entries)) {
    throw new Error("Growth portfolio entries must be an array");
  }

  const pageBySlug = new Map(publishedPages.map((page) => [page.slug, page]));
  const entrySlugs = rawPortfolio.entries.map((entry) => String(entry?.sourceSlug || ""));
  if (new Set(entrySlugs).size !== entrySlugs.length) {
    throw new Error("Growth portfolio source slugs must be unique");
  }
  const missingSlugs = [...pageBySlug.keys()].filter((slug) => !entrySlugs.includes(slug));
  const unknownSlugs = entrySlugs.filter((slug) => !pageBySlug.has(slug));
  if (missingSlugs.length || unknownSlugs.length) {
    throw new Error(
      `Growth portfolio must cover every published page. Missing: ${missingSlugs.join(", ") || "none"}; unknown: ${unknownSlugs.join(", ") || "none"}`,
    );
  }

  const entries = rawPortfolio.entries.map((entry) => {
    const page = pageBySlug.get(entry.sourceSlug);
    if (!page || entry.path !== page.path || entry.keyword !== page.keyword) {
      throw new Error(`Growth portfolio metadata does not match /${entry.sourceSlug}`);
    }
    if (entry.state === "unavailable") {
      if (typeof entry.reason !== "string" || entry.reason.trim().length < 20) {
        throw new Error(`Unavailable growth entry needs a specific reason: ${entry.sourceSlug}`);
      }
      return {
        sourceSlug: page.slug,
        path: page.path,
        keyword: page.keyword,
        state: "unavailable",
        reason: entry.reason.trim(),
      };
    }
    if (entry.state !== "collected") {
      throw new Error(`Growth entry must be collected or unavailable: ${entry.sourceSlug}`);
    }
    return {
      sourceSlug: page.slug,
      path: page.path,
      keyword: page.keyword,
      state: "collected",
      report: publicPortfolioReport(entry.report, page, rawPortfolio),
    };
  });

  const collectedEntries = entries.filter((entry) => entry.state === "collected");
  const attributionJoinBlocked = collectedEntries.some(
    (entry) => entry.report.decisionState.attributionJoinBlocked,
  );
  const attributionJoinReady =
    collectedEntries.length === entries.length &&
    collectedEntries.every((entry) => entry.report.decisionState.attributionJoinChecked);
  const hasSearchValidatedLandingPage = collectedEntries.some(
    (entry) => entry.report.decisionState.samePageSearchValidated,
  );
  if (publicSnapshot) {
    const expectedSummary = {
      publishedPages: entries.length,
      collectedPages: collectedEntries.length,
      unavailablePages: entries.length - collectedEntries.length,
      attributionJoinReady,
      attributionJoinBlocked,
      hasSearchValidatedLandingPage,
    };
    for (const [key, value] of Object.entries(expectedSummary)) {
      if (rawPortfolio.summary?.[key] !== value) {
        throw new Error(`Public growth portfolio summary is inconsistent: ${key}`);
      }
    }
  }
  return {
    schemaVersion: 2,
    privacyClass: "public_growth_evidence",
    generatedAt: rawPortfolio.generatedAt,
    periodBasis: "complete_shanghai_calendar_days",
    reportingWindowDays: rawPortfolio.reportingWindowDays,
    reportingLagDays: rawPortfolio.reportingLagDays,
    aggregationKey: "source_slug+reporting_period",
    periodStart: rawPortfolio.periodStart,
    periodEnd: rawPortfolio.periodEnd,
    summary: {
      publishedPages: entries.length,
      collectedPages: collectedEntries.length,
      unavailablePages: entries.length - collectedEntries.length,
      attributionJoinReady,
      attributionJoinBlocked,
      hasSearchValidatedLandingPage,
    },
    entries,
  };
}

function assertCreatePageGrowthReadiness(portfolio) {
  if (unattendedPolicy.allowCreatePageWhenMetricsUnavailable !== false) {
    throw new Error("Create-page growth readiness gate requires allowCreatePageWhenMetricsUnavailable=false");
  }
  const summary = portfolio?.summary;
  const entries = Array.isArray(portfolio?.entries) ? portfolio.entries : [];
  const pageReadinessFailures = entries.filter((entry) =>
    entry?.state !== "collected" ||
    entry.report?.decisionState?.searchPerformanceReady !== true ||
    entry.report?.decisionState?.landingUvReady !== true ||
    entry.report?.decisionState?.qualifiedOutboundReady !== true);
  const ready = Boolean(summary) &&
    summary.collectedPages === summary.publishedPages &&
    summary.unavailablePages === 0 &&
    summary.attributionJoinReady === true &&
    entries.length === summary.publishedPages &&
    pageReadinessFailures.length === 0;
  if (!ready) {
    const failedSlugs = pageReadinessFailures.map((entry) => entry?.sourceSlug || "<unknown>");
    throw new Error(
      "Create-page growth readiness gate failed: every published page must be collected with " +
      "Search Console, landing UV, and qualified outbound readiness, zero unavailable pages, " +
      `and attributionJoinReady=true${failedSlugs.length ? `; failed pages: ${failedSlugs.join(", ")}` : ""}`,
    );
  }
}

function validatePortfolioDecision(rawDecision, publishedPages) {
  const allowedActions = new Set(["create_page", "improve_page", "consolidate", "observe"]);
  if (!rawDecision || !allowedActions.has(rawDecision.action)) {
    throw new Error("Research must include a portfolioDecision with create_page, improve_page, consolidate, or observe");
  }
  if (typeof rawDecision.rationale !== "string" || rawDecision.rationale.trim().length < 40) {
    throw new Error("portfolioDecision needs a specific evidence-led rationale");
  }
  const evidenceSlugs = Array.isArray(rawDecision.evidenceSlugs)
    ? rawDecision.evidenceSlugs.map(String)
    : [];
  if (new Set(evidenceSlugs).size !== evidenceSlugs.length) {
    throw new Error("portfolioDecision evidenceSlugs must be unique");
  }
  const publishedSlugs = new Set(publishedPages.map((page) => page.slug));
  if (evidenceSlugs.some((slug) => !publishedSlugs.has(slug))) {
    throw new Error("portfolioDecision may cite only published source slugs");
  }
  if (publishedPages.length && !evidenceSlugs.length) {
    throw new Error("portfolioDecision must cite at least one published page");
  }
  const targetSlug = rawDecision.targetSlug == null ? null : String(rawDecision.targetSlug);
  if (["improve_page", "consolidate"].includes(rawDecision.action) && !publishedSlugs.has(targetSlug)) {
    throw new Error(`${rawDecision.action} requires a published targetSlug`);
  }
  if (rawDecision.action === "create_page" && targetSlug !== null) {
    throw new Error("create_page must not target an existing slug");
  }
  if (rawDecision.action === "observe" && targetSlug !== null && !publishedSlugs.has(targetSlug)) {
    throw new Error("observe targetSlug must be null or an existing published page");
  }
  const sourceSlug = rawDecision.sourceSlug == null ? null : String(rawDecision.sourceSlug);
  const overlapQueries = Array.isArray(rawDecision.overlapQueries)
    ? [...new Set(
        rawDecision.overlapQueries
          .map((query) => String(query || "").trim().toLowerCase())
          .filter(Boolean),
      )]
    : [];
  if (rawDecision.action === "consolidate") {
    if (!publishedSlugs.has(sourceSlug) || sourceSlug === targetSlug) {
      throw new Error("consolidate requires a distinct published sourceSlug");
    }
    if (!overlapQueries.length) {
      throw new Error("consolidate requires explicit overlapQueries evidence");
    }
    if (!evidenceSlugs.includes(sourceSlug) || !evidenceSlugs.includes(targetSlug)) {
      throw new Error("consolidate evidenceSlugs must include both sourceSlug and targetSlug");
    }
  }
  return {
    schemaVersion: 1,
    action: rawDecision.action,
    targetSlug,
    rationale: rawDecision.rationale.trim(),
    evidenceSlugs,
    ...(rawDecision.action === "consolidate"
      ? { sourceSlug, overlapQueries }
      : {}),
  };
}

const pages = existingPages();
const reports = existingReports();
const architectureHistory = publishedArchitectureHistoryFromReports(reports);
const publishedIntents = publishedIntentRecords(pages, reports);
const preparedCandidateInputs = input.candidates.map((candidate) => {
  const keyword = String(candidate.keyword || "").trim().toLowerCase();
  const decisionEvidence = candidate.decisionEvidence || {};
  const evidenceRefs = Array.isArray(decisionEvidence.evidenceRefs)
    ? decisionEvidence.evidenceRefs.map((id) => String(id || "").trim())
    : [];
  const referencedDomains = new Set();
  for (const evidenceId of evidenceRefs) {
    const item = evidenceById.get(evidenceId);
    if (!item) throw new Error(`Candidate ${keyword} references unknown evidence: ${evidenceId}`);
    const supports = new Set(
      (Array.isArray(item.supports) ? item.supports : [])
        .map((value) => String(value || "").trim().toLowerCase()),
    );
    if (!supports.has(keyword)) {
      throw new Error(`Evidence ${evidenceId} does not directly support candidate: ${keyword}`);
    }
    referencedDomains.add(evidenceDomainById.get(evidenceId));
  }
  if (referencedDomains.size < policy.decisionEvidence.minIndependentDomains) {
    throw new Error(
      `Candidate ${keyword} needs evidence from at least ${policy.decisionEvidence.minIndependentDomains} independent domains`,
    );
  }
  const productFactIds = Array.isArray(decisionEvidence.productFactIds)
    ? decisionEvidence.productFactIds
    : [];
  const unknownFactId = productFactIds.find((id) => !approvedFactIds.has(id));
  if (unknownFactId) {
    throw new Error(`Candidate ${keyword} references an unapproved product fact ID: ${unknownFactId}`);
  }
  if (
    unsupportedKeywords.some((pattern) => pattern.test(keyword)) &&
    Array.isArray(decisionEvidence.productSignals) &&
    decisionEvidence.productSignals.length > 0
  ) {
    throw new Error(`Unsupported capability keyword cannot claim product-fit signals: ${keyword}`);
  }
  const claimedCannibalizationClass = String(decisionEvidence.cannibalizationClass || "");
  const claimedNearestExistingSlug = decisionEvidence.nearestExistingSlug;
  const derivedIntentMatch = findPublishedIntentMatch(candidate, publishedIntents);
  if (derivedIntentMatch) {
    const derivedSlug = derivedIntentMatch.record.slug;
    if (claimedCannibalizationClass === "new_intent" || claimedNearestExistingSlug !== derivedSlug) {
      throw new Error(
        `Candidate ${keyword} is a semantic near-duplicate of published /${derivedSlug} ` +
        `(${derivedIntentMatch.candidateField.source} matched ${derivedIntentMatch.publishedField.source}) ` +
        `and must use a non-new-intent binding with nearestExistingSlug ${derivedSlug}`,
      );
    }
    const nearestPage = pages.find((page) => page.slug === derivedSlug);
    if (!nearestPage) throw new Error(`Derived published intent has no page: ${derivedSlug}`);
    if (candidate.existingUrl && candidate.existingUrl !== nearestPage.path) {
      throw new Error(`Candidate ${keyword} existingUrl does not match derived nearestExistingSlug`);
    }
    const derivedCannibalizationClass = (
      derivedIntentMatch.comparison.exactFingerprint ||
      derivedIntentMatch.comparison.taskFingerprintMatch ||
      derivedIntentMatch.comparison.similarity >= 0.84
    ) ? "same_intent" : "adjacent_intent";
    return {
      ...candidate,
      existingUrl: nearestPage.path,
      decisionEvidence: {
        ...decisionEvidence,
        cannibalizationClass: derivedCannibalizationClass,
        nearestExistingSlug: derivedSlug,
      },
    };
  }
  if (claimedCannibalizationClass === "new_intent") {
    if (candidate.existingUrl) {
      throw new Error(`A new_intent candidate cannot name an existingUrl: ${keyword}`);
    }
    return candidate;
  }
  if (typeof claimedNearestExistingSlug !== "string") return candidate;
  const nearestPage = pages.find((page) => page.slug === claimedNearestExistingSlug);
  if (!nearestPage) {
    throw new Error(`Candidate ${keyword} names an unpublished nearestExistingSlug: ${claimedNearestExistingSlug}`);
  }
  if (candidate.existingUrl && candidate.existingUrl !== nearestPage.path) {
    throw new Error(`Candidate ${keyword} existingUrl does not match nearestExistingSlug`);
  }
  return { ...candidate, existingUrl: nearestPage.path };
});
const portfolioFunnels = validatePortfolioSnapshot(readPortfolioInput(), pages);
const portfolioDecision = validatePortfolioDecision(input.portfolioDecision, pages);
const isCreatePageDecision = input.publicationMode !== "update" && portfolioDecision.action === "create_page";
if (isCreatePageDecision) assertCreatePageGrowthReadiness(portfolioFunnels);
const opportunities = preparedCandidateInputs
  .map((candidate) => scoreResearchCandidate(candidate, policy, { reportDate: date }))
  .sort((left, right) => right.score - left.score)
  .slice(0, policy.candidateCount.max);
const eligibleCreateCandidates = opportunities.filter((candidate) =>
  candidate.action === "create_page" && candidate.gate?.passed === true);
const eligibleCreateBatch = analyzeCandidateIntentBatch(eligibleCreateCandidates);
const eligibleCreateOpportunities = eligibleCreateBatch.clusters.map((cluster) =>
  eligibleCreateCandidates[cluster.members[0].index]);
if (input.publicationMode !== "update" && eligibleCreateOpportunities.length < requiredDistinctIntents) {
  throw new Error(
    `Research requires at least ${requiredDistinctIntents} semantically distinct candidates that passed all gates ` +
    `with action=create_page; found ${eligibleCreateOpportunities.length}`,
  );
}
const rawDrafts = Array.isArray(input.drafts) && input.drafts.length ? input.drafts : input.draft ? [input.draft] : [];
if (rawDrafts.length > policy.dailyPageLimit) {
  throw new Error(`A daily report may contain at most ${policy.dailyPageLimit} publishable draft`);
}
if (isCreatePageDecision && rawDrafts.length) {
  assertSelectedCreateTrendReadiness(rawDrafts[0]?.keyword, trendSignals, trendCollection);
}

const preparedDrafts = rawDrafts.map((rawDraft, index) => {
  const keyword = String(rawDraft?.keyword || "").trim().toLowerCase();
  const opportunity = opportunities.find((candidate) => candidate.keyword === keyword);
  if (!opportunity) throw new Error(`Draft ${index + 1} has no researched opportunity: ${keyword || "<empty>"}`);
  const expectedAction = input.publicationMode === "update" ? "improve_page" : "create_page";
  if (opportunity.action !== expectedAction) {
    throw new Error(`Draft ${index + 1} must target an opportunity marked ${expectedAction}`);
  }
  const draft = validateDraft(rawDraft, keyword);
  const pageSlug = input.publicationMode === "update"
    ? portfolioDecision.targetSlug
    : slugify(opportunity.keyword);
  if (!pageSlug) throw new Error("Draft keyword did not produce a safe slug");
  if (retiredPageSlugs.has(pageSlug)) {
    throw new Error(`Page /${pageSlug} was retired by explicit user feedback and cannot be republished automatically`);
  }
  if (rawDraft.slug && String(rawDraft.slug).replace(/^\//, "") !== pageSlug) {
    throw new Error(`Draft slug must match the researched keyword: ${pageSlug}`);
  }
  const sameSlug = pages.find((page) => page.slug === pageSlug);
  if (sameSlug && input.publicationMode !== "update" && sameSlug.generatedFromReport !== `seo-${date}`) {
    throw new Error(`Page /${pageSlug} already exists. Research a new opportunity or use publicationMode update.`);
  }
  const contextualPages = pages.filter((page) => page.slug !== pageSlug);
  const allowedInternalHrefs = new Set(["/", ...contextualPages.map((page) => page.path)]);
  const internalHrefs = (draft.internalLinks || []).map((link) => link.href);
  if (new Set(internalHrefs).size !== internalHrefs.length) {
    throw new Error("Draft internal link targets must be unique");
  }
  const invalidInternalLink = (draft.internalLinks || []).find((link) => !allowedInternalHrefs.has(link.href));
  if (invalidInternalLink) throw new Error(`Internal link target is not a published route: ${invalidInternalLink.href}`);
  if (contextualPages.length > 0 && !(draft.internalLinks || []).some((link) => link.href !== "/")) {
    throw new Error("The new page needs at least one contextual link to a published first-party page");
  }
  const preparedDraft = { ...draft, slug: `/${pageSlug}` };
  const selectedPresentation = preparedDraft.architecture?.presentation;
  if (retiredRecipeIds.has(selectedPresentation?.recipeId) || retiredPaletteIds.has(selectedPresentation?.paletteId)) {
    throw new Error(`Presentation ${selectedPresentation?.recipeId || "<missing>"}/${selectedPresentation?.paletteId || "<missing>"} was retired by explicit user feedback`);
  }
  const comparisonPages = pages.filter((page) => page.slug !== pageSlug);
  validatePageArchitecture({
    draft: preparedDraft,
    contentStrategy,
    candidate: opportunity,
    pages: comparisonPages,
    architecturePolicy,
    presentationCatalog,
  });
  const novelty = analyzeContentNovelty({
    draft: preparedDraft,
    pages,
    architectureHistory,
    architecturePolicy,
    presentationCatalog,
    allowedPhrases: factCatalog.facts.map((fact) => fact.statement),
    enforceEnhancedNovelty: date >= architecturePolicy.enhancedNoveltyEnforcedFromReportDate,
  });
  if (!novelty.passed) {
    const first = novelty.violations[0];
    throw new Error(`Content distinctness gate failed [${first.code}]: ${first.detail}`);
  }
  const architectureChecks = [
    { id: "content-contract", label: "Content layers match the reviewed architecture", passed: true, detail: `${preparedDraft.architecture.content.archetype}; ${preparedDraft.sections.length} mapped sections` },
    { id: "content-distinctness", label: "Content is distinct from published pages", passed: true, detail: `${novelty.nearest.length} published comparisons; no text or structure violations` },
    { id: "presentation-distinctness", label: "Presentation recipe passed its reuse policy", passed: true, detail: preparedDraft.architecture.presentation.recipeId },
    { id: "optional-decoration", label: "Gallery and companion are explicit", passed: true, detail: `gallery=${preparedDraft.architecture.presentation.gallery}; companion=${preparedDraft.architecture.presentation.companion}` },
  ];
  const architectureCheckIds = new Set(architectureChecks.map((check) => check.id));
  preparedDraft.quality = {
    ...preparedDraft.quality,
    passed: preparedDraft.quality.passed && novelty.passed,
    checks: [
      ...preparedDraft.quality.checks.filter((check) => !architectureCheckIds.has(check.id)),
      ...architectureChecks,
    ],
    novelty,
  };
  preparedDraft.status = preparedDraft.quality.passed ? "ready_for_review" : "blocked";
  return {
    draft: preparedDraft,
    opportunity,
    pageSlug,
  };
});

const draft = preparedDrafts[0]?.draft ?? null;
const selectedOpportunity = preparedDrafts[0]?.opportunity ?? opportunities.find((candidate) => candidate.action === "create_page") ?? opportunities[0];
if (!selectedOpportunity) throw new Error("Research produced no scored opportunity");
const selectedCreateKeyword = selectedOpportunity.action === "create_page"
  ? selectedOpportunity.keyword
  : null;
if (isCreatePageDecision) {
  assertSelectedCreateBreakoutEvidence(
    selectedCreateKeyword,
    [...normalizedBreakoutEvidenceById.values()],
  );
}
const eligibleFallbacks = eligibleCreateOpportunities
  .filter((candidate) => candidate.keyword !== selectedCreateKeyword)
  .map((candidate, index) => ({
    rank: index + 1,
    keyword: candidate.keyword,
    searcherJob: candidate.decisionEvidence.searcherJob,
    score: candidate.score,
    action: candidate.action,
  }));
const performance = Array.isArray(input.performance) ? input.performance.map((row, index) => {
  const normalized = {
    url: String(row.url || ""),
    query: String(row.query || "").trim(),
    clicks: Number(row.clicks),
    impressions: Number(row.impressions),
    ctr: Number(row.ctr),
    position: Number(row.position),
    recommendedAction: String(row.recommendedAction || "").trim(),
  };
  if (!isValidPerformanceUrl(normalized.url) || !normalized.query || !normalized.recommendedAction ||
    !Number.isFinite(normalized.clicks) || normalized.clicks < 0 ||
    !Number.isFinite(normalized.impressions) || normalized.impressions < 0 ||
    normalized.clicks > normalized.impressions ||
    !Number.isFinite(normalized.ctr) || normalized.ctr < 0 || normalized.ctr > 1 ||
    !Number.isFinite(normalized.position) || normalized.position <= 0) {
    throw new Error(`Invalid Search Console performance row ${index + 1}`);
  }
  return normalized;
}) : [];
const totals = performance.reduce(
  (result, row) => ({ clicks: result.clicks + (Number(row.clicks) || 0), impressions: result.impressions + (Number(row.impressions) || 0) }),
  { clicks: 0, impressions: 0 },
);
const consolidationEvidence = evaluateConsolidationEvidence({
  decision: portfolioDecision,
  entries: portfolioFunnels.entries,
  performance,
  minimumImpressions: 20,
});
if (!consolidationEvidence.passed) {
  throw new Error(`Consolidation evidence gate failed: ${consolidationEvidence.reason} Record observe until the evidence is sufficient.`);
}
const funnel = validateFunnel(input.funnel);
const feedbackGate = evaluateGrowthFeedbackGate({
  attributionJoinBlocked: portfolioFunnels.summary.attributionJoinBlocked,
  policy: policy.feedbackLoop,
});
if (!feedbackGate.passed) throw new Error(feedbackGate.reason);
if (rawDrafts.length) {
  const expectedDecision = input.publicationMode === "update" ? "improve_page" : "create_page";
  if (portfolioDecision.action !== expectedDecision) {
    throw new Error(`A supplied draft requires portfolioDecision.action ${expectedDecision}`);
  }
}
if (["consolidate", "observe"].includes(portfolioDecision.action) && rawDrafts.length) {
  throw new Error(`${portfolioDecision.action} cannot publish a new draft`);
}
if (input.publicationMode === "update" && preparedDrafts.length) {
  const targetPath = preparedDrafts[0].opportunity.existingUrl;
  const targetPage = pages.find((page) => page.slug === portfolioDecision.targetSlug);
  if (!targetPage || targetPage.path !== targetPath) {
    throw new Error("Update mode targetSlug must match the opportunity existingUrl");
  }
  const matchingPerformance = performance.some((row) => {
    try {
      const rowPath = row.url.startsWith("/") ? row.url : new URL(row.url).pathname;
      const expectedPath = targetPath?.startsWith("/") ? targetPath : new URL(targetPath).pathname;
      return rowPath === expectedPath;
    } catch {
      return false;
    }
  });
  if (!matchingPerformance) {
    throw new Error("Update mode requires an observed Search Console row for the exact published target page");
  }
}
const checkedAt = new Date().toISOString();
const reportId = `seo-${date}`;
const publication = !draft
  ? { status: "not_requested", reason: "No draft was supplied for editorial review." }
  : draft.quality.passed
    ? {
        status: "ready_for_review",
        slug: preparedDrafts[0].pageSlug,
        path: `/${preparedDrafts[0].pageSlug}`,
        draftDigest: sha256({
          draft,
          contentStrategy,
          ...(date >= policy.googleTrends.automatedCollectionEnforcedFromReportDate
            ? { googleTrendsSnapshotDigest: trendCollection?.snapshotDigest ?? null }
            : {}),
        }),
        reason: "Automated gates passed. A separate editorial approval record bound to the content, presentation, and trend-evidence contract is required before publication.",
      }
    : { status: "blocked", reason: "Draft did not pass all automated quality gates." };
const phrase = titleCase(selectedOpportunity.keyword);
const pageType = /how|what|ideas|guide/.test(selectedOpportunity.keyword) ? "guide" : /romance|fantasy|mystery|school|life/.test(selectedOpportunity.keyword) ? "scenario" : "product";
const allFunnelObserved = Object.values(funnel.metrics).every((metric) => metric.status === "observed");
const portfolioActionLabels = {
  create_page: "create a new page",
  improve_page: `improve /${portfolioDecision.targetSlug}`,
  consolidate: `consolidate /${portfolioDecision.targetSlug}`,
  observe: portfolioDecision.targetSlug ? `observe /${portfolioDecision.targetSlug}` : "observe the portfolio",
};
const portfolioAction = portfolioActionLabels[portfolioDecision.action];

const report = {
  id: reportId,
  date,
  policyVersion: policy.policyVersion,
  ...(portfolioDecision.action === "improve_page"
    ? { publicationMode: "update" }
    : portfolioDecision.action === "create_page"
      ? { publicationMode: "create" }
      : {}),
  generatedAt: input.generatedAt || checkedAt,
  mode: performance.length && allFunnelObserved ? "live" : "partial",
  headline: `Today's revenue-first priority: ${portfolioAction}`,
  summary: {
    candidatesAnalyzed: input.candidates.length,
    publishableOpportunities: eligibleCreateOpportunities.length,
    eligibleFallbackIntents: eligibleFallbacks.length,
    totalClicks: totals.clicks,
    totalImpressions: totals.impressions,
    averageCtr: totals.impressions ? totals.clicks / totals.impressions : 0,
  },
  candidateIntentGate: {
    schemaVersion: 1,
    state: input.publicationMode === "update" ? "not_applicable_update" : "passed",
    requiredDistinctCreateIntents: requiredDistinctIntents,
    eligibleDistinctCreateIntents: eligibleCreateOpportunities.length,
    selectedKeyword: selectedCreateKeyword,
    eligibleFallbackCount: eligibleFallbacks.length,
    eligibleFallbacks,
  },
  opportunities,
  performance,
  trendSignals,
  ...(trendCollection ? { trendCollection } : {}),
  feedbackDecisions,
  portfolioFunnels,
  portfolioDecision,
  publication,
  publications: [publication],
  actions: [
    { priority: "P0", action: portfolioAction, why: portfolioDecision.rationale, expectedImpact: portfolioDecision.action === "create_page" ? "Target a specific searcher who is close to trial or purchase." : "Use observed portfolio evidence before increasing page count." },
    { priority: "P1", action: "Verify evidence, intent, and conversion hypothesis", why: "Research proxies rank options; they do not replace observed search or revenue data.", expectedImpact: "Prevent broad traffic from displacing qualified product demand." },
    { priority: "P2", action: publication.status === "ready_for_review" ? `Independently review ${publication.path} before publishing` : "Resolve the failed publication gate", why: publication.reason, expectedImpact: "Keep editorial approval separate from generation." },
  ],
  brief: {
    keyword: selectedOpportunity.keyword,
    slug: portfolioDecision.action === "improve_page"
      ? `/${portfolioDecision.targetSlug}`
      : `/${slugify(selectedOpportunity.keyword)}`,
    pageType,
    searchIntent: selectedOpportunity.intent,
    title: draft?.title ?? `${phrase} | D&D Table-Ready Field Guide`,
    description: draft?.metaDescription ?? `Use an original, table-ready framework for ${selectedOpportunity.keyword} without borrowed settings, characters, or rules text.`,
    h1: draft?.h1 ?? phrase,
    primaryCta: draft?.primaryCta ?? "Explore D&D-focused content on NovelAI",
    sections: draft?.architecture?.content?.sections?.map((section) => `${section.role}: ${section.uniqueTakeaway}`) ?? ["Define a distinct content architecture before drafting"],
    evidenceRequired: ["Public evidence for the intent", "Approved product facts", "Original non-infringing material", "Verified CTA and attribution route"],
    qualityGate: ["One intent and one H1", "Content and presentation contracts passed", "No unlicensed third-party IP", "Independent editorial review", "Render, link, and index checks"],
  },
  draft,
  drafts: preparedDrafts.map((prepared) => prepared.draft),
  contentStrategy,
  integrations: [
    { id: "semrush", name: "SEO Research Tools", state: "configured", detail: "The shared GURU/PRO account is used for human-assisted keyword and competitor research; provider metrics must be labelled as observed when copied into evidence." },
    { id: "codex_research", name: "Codex Research", state: "connected", detail: `${input.evidence.length} public evidence links support ${input.candidates.length} candidates.`, lastCheckedAt: checkedAt },
    {
      id: "google_trends",
      name: "Google Trends",
      state: trendCollection?.state === "observed" || trendSignals.some((signal) => signal.state === "observed")
        ? "connected"
        : trendCollection?.state === "unavailable" ? "error" : "missing",
      detail: trendCollection?.state === "observed"
        ? `Official US DMA Top/Rising feed collected for ${trendCollection.week}; ${trendSignals.filter((signal) => signal.state === "observed").length} exact rising candidate match(es).`
        : trendCollection?.detail || "No same-day official Google Trends collection is bound to this report.",
      ...(trendCollection?.collectedAt ? { lastCheckedAt: trendCollection.collectedAt } : {}),
      href: "https://support.google.com/trends/answer/12764470?hl=en",
      actionLabel: "Open Google Trends dataset guide",
    },
    { id: "search_console", name: "Google Search Console", state: performance.length ? "connected" : "missing", detail: performance.length ? `${performance.length} visible query/page rows recorded.` : "No visible Search Console rows were available; no metrics were inferred.", href: "https://search.google.com/search-console", actionLabel: "Open Search Console" },
    { id: "ai_gateway", name: "Codex Content", state: draft ? "connected" : "configured", detail: draft ? "A fact-constrained draft is ready for a separate editorial review." : "Research is ready for drafting." },
    { id: "github", name: "GitHub Reports", state: "configured", detail: "Daily reports and approved pages are committed only after verification.", href: "https://github.com/lium53492-rgb/seo/tree/main/data/reports", actionLabel: "Open report history" },
    { id: "product_analytics", name: "Revenue Attribution", state: funnel.attributionStatus === "connected" ? "connected" : funnel.attributionStatus === "partial" ? "configured" : "missing", detail: portfolioFunnels.summary.attributionJoinReady ? "Private downstream attribution was checked; only boolean readiness and blocking state are retained in this public report." : "Private downstream attribution readiness is incomplete; no commercial outcome detail is retained in this public report.", href: "https://vercel.com/elser1/seo/analytics", actionLabel: "Open analytics" },
  ],
  evidence: input.evidence.map((item) => {
    const url = new URL(item.url);
    const evidenceId = String(item.id);
    const breakout = normalizedBreakoutEvidenceById.get(evidenceId);
    return {
      id: evidenceId,
      title: String(item.title || url.hostname),
      url: url.toString(),
      source: String(item.source || url.hostname),
      collectedAt: item.collectedAt || checkedAt,
      supports: Array.isArray(item.supports) ? item.supports.map(String) : [],
      ...(breakout
        ? { kind: breakout.kind, signal: breakout.signal }
        : {}),
    };
  }),
  caveats: [
    "Product fit, trial intent, revenue intent, specificity, originality, IP risk, and cannibalization risk are derived from policy-versioned evidence signals rather than AI-supplied scores.",
    "Demand and difficulty remain transparent 0-100 research proxies and require candidate-level rationales and evidence references unless an evidence record explicitly names an observed provider metric.",
    "Google Trends Explore relative interest is a normalized 0-100 signal, not search volume. BigQuery Top/Rising observations preserve DMA provenance and never infer a nationwide relative-interest score; an exact miss is not zero demand.",
    "Every locally unconsumed editorial instruction is preserved verbatim with an adopted or rejected decision before it may be marked consumed.",
    "Missing Search Console, UV, trial, payment, or revenue data stays unavailable rather than being converted to zero.",
    "The report builder never publishes a page; scripts/publish-reviewed-page.mjs requires a separate approval record.",
  ],
};

const outputPath = resolve(`data/reports/${date}.json`);
if (existsSync(outputPath)) {
  throw new Error(`Refusing to overwrite existing daily report: ${outputPath}`);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeJsonAtomic(outputPath, report);
process.stdout.write(`${outputPath}\n`);
