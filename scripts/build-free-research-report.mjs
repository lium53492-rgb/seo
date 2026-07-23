import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { scoreResearchCandidate } from "./lib/seo-policy.mjs";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: npm run research:build -- data/research/YYYY-MM-DD.json");

const readJson = (path) => JSON.parse(readFileSync(resolve(path), "utf8"));
const input = readJson(inputPath);
const policy = readJson("data/config/seo-policy.json");
const factCatalog = readJson("data/config/product-facts.json");
const date = String(input.date || "");

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
if (Number(input.policyVersion) !== policy.policyVersion) {
  throw new Error(`Research must use policyVersion ${policy.policyVersion}`);
}

const contentStrategy = input.contentStrategy || null;
const requiredStrategyFields = [
  "searcherJob",
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

if (!Array.isArray(input.candidates) || input.candidates.length < policy.candidateCount.min || input.candidates.length > policy.candidateCount.max) {
  throw new Error(`Research requires ${policy.candidateCount.min}-${policy.candidateCount.max} candidates`);
}
if (!Array.isArray(input.evidence) || input.evidence.length < policy.evidence.minLinks) {
  throw new Error(`Research requires at least ${policy.evidence.minLinks} evidence links`);
}

const slugify = (value) => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const titleCase = (value) => String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
const approvedFactIds = new Set(factCatalog.facts.map((fact) => fact.id));
const forbiddenClaims = factCatalog.forbiddenClaimPatterns.map((pattern) => new RegExp(pattern, "i"));
const unsupportedKeywords = factCatalog.unsupportedKeywordPatterns.map((pattern) => new RegExp(pattern, "i"));

function registrableDomain(hostname) {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const commonSecondLevelSuffixes = new Set(["co.uk", "org.uk", "com.au", "com.cn", "com.hk", "co.jp"]);
  const lastTwo = labels.slice(-2).join(".");
  return commonSecondLevelSuffixes.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
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
for (const item of input.evidence) {
  const url = new URL(item.url);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Evidence URLs must use HTTP(S)");
  if (!String(item.title || "").trim() || !String(item.source || "").trim()) {
    throw new Error("Every evidence item needs a title and source");
  }
  if (!Number.isFinite(Date.parse(item.collectedAt || ""))) {
    throw new Error(`Evidence needs a valid collectedAt timestamp: ${item.url}`);
  }
  evidenceDomains.add(registrableDomain(url.hostname));
  for (const keyword of Array.isArray(item.supports) ? item.supports : []) {
    supportedKeywords.add(String(keyword).trim().toLowerCase());
  }
}
const candidateKeywords = input.candidates.map((candidate) => String(candidate.keyword || "").trim().toLowerCase());
if (new Set(candidateKeywords).size !== candidateKeywords.length) {
  throw new Error("Research candidates must use unique keywords");
}
if (evidenceDomains.size < policy.evidence.minDomains) {
  throw new Error(`Evidence must come from at least ${policy.evidence.minDomains} independent domains`);
}
for (const candidate of input.candidates) {
  const keyword = String(candidate.keyword || "").trim().toLowerCase();
  if (!keyword || !supportedKeywords.has(keyword)) {
    throw new Error(`Missing evidence support for candidate: ${keyword || "<empty>"}`);
  }
  if (unsupportedKeywords.some((pattern) => pattern.test(keyword)) && Number(candidate.productFit) > 49) {
    throw new Error(`Unsupported capability keyword must have productFit <= 49: ${keyword}`);
  }
}

function meaningfulWords(value) {
  const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "inside", "is", "it", "of", "on", "or", "story", "that", "the", "this", "to", "voice", "what", "when", "with", "you", "your"]);
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g)?.filter((word) => word.length > 2 && !stopWords.has(word)) ?? []);
}

function pageText(page) {
  return [page.h1, page.heroMarkdown, ...(Array.isArray(page.sections) ? page.sections.flatMap((section) => [section.heading, section.bodyMarkdown]) : [])].join(" ");
}

function similarity(left, right) {
  const leftWords = meaningfulWords(left);
  const rightWords = meaningfulWords(right);
  if (!leftWords.size || !rightWords.size) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  return intersection / new Set([...leftWords, ...rightWords]).size;
}

function existingPages() {
  const directory = resolve("data/pages");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(resolve(directory, name)))
    .filter((page) => page.status === "published");
}

function validateDraft(rawDraft, keyword) {
  if (!rawDraft) return null;
  if (String(rawDraft.keyword || "").trim().toLowerCase() !== keyword) {
    throw new Error(`Draft keyword must match its researched opportunity: ${keyword}`);
  }
  if (rawDraft.language !== "en" || rawDraft.reviewRequired !== true) {
    throw new Error("Draft must be English and require editorial review");
  }
  const factIds = Array.isArray(rawDraft.factIdsUsed) ? rawDraft.factIdsUsed : [];
  if (factIds.length < 2 || factIds.some((id) => !approvedFactIds.has(id))) {
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
  const publishableText = [
    rawDraft.title,
    rawDraft.metaDescription,
    rawDraft.h1,
    rawDraft.heroMarkdown,
    ...sections.flatMap((section) => [section.heading, section.bodyMarkdown]),
    ...faqs.flatMap((faq) => [faq.question, faq.answerMarkdown]),
  ].join(" ");
  const failedClaim = forbiddenClaims.find((pattern) => pattern.test(publishableText));
  if (failedClaim) throw new Error(`Draft contains an unsupported product claim: ${failedClaim}`);
  const wordCount = (publishableText.match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
  const suppliedChecks = Array.isArray(rawDraft.quality?.checks) ? rawDraft.quality.checks : [];
  const automatedChecks = [
    { id: "approved-facts", label: "Uses approved product facts", passed: true, detail: `${factIds.length} approved fact IDs` },
    { id: "content-structure", label: "Has required sections and FAQs", passed: sections.length >= policy.content.minSections && faqs.length >= policy.content.minFaqs, detail: `${sections.length} sections; ${faqs.length} FAQs` },
    { id: "conversion-path", label: "Has a concrete CTA", passed: rawDraft.primaryCta.trim().length >= 5, detail: rawDraft.primaryCta.trim() },
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
const allowedMetricSources = new Set(["search_console", "vercel_analytics", "seo_redirect", "product_analytics", "payments"]);

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

const opportunities = input.candidates
  .map((candidate) => scoreResearchCandidate(candidate, policy))
  .sort((left, right) => right.score - left.score)
  .slice(0, policy.candidateCount.max);
const rawDrafts = Array.isArray(input.drafts) && input.drafts.length ? input.drafts : input.draft ? [input.draft] : [];
if (rawDrafts.length > policy.dailyPageLimit) {
  throw new Error(`A daily report may contain at most ${policy.dailyPageLimit} publishable draft`);
}

const pages = existingPages();
const preparedDrafts = rawDrafts.map((rawDraft, index) => {
  const keyword = String(rawDraft?.keyword || "").trim().toLowerCase();
  const opportunity = opportunities.find((candidate) => candidate.keyword === keyword);
  if (!opportunity) throw new Error(`Draft ${index + 1} has no researched opportunity: ${keyword || "<empty>"}`);
  const expectedAction = input.publicationMode === "update" ? "improve_page" : "create_page";
  if (opportunity.action !== expectedAction) {
    throw new Error(`Draft ${index + 1} must target an opportunity marked ${expectedAction}`);
  }
  const draft = validateDraft(rawDraft, keyword);
  const pageSlug = slugify(opportunity.keyword);
  if (!pageSlug) throw new Error("Draft keyword did not produce a safe slug");
  if (rawDraft.slug && String(rawDraft.slug).replace(/^\//, "") !== pageSlug) {
    throw new Error(`Draft slug must match the researched keyword: ${pageSlug}`);
  }
  const sameSlug = pages.find((page) => page.slug === pageSlug);
  if (sameSlug && input.publicationMode !== "update" && sameSlug.generatedFromReport !== `seo-${date}`) {
    throw new Error(`Page /${pageSlug} already exists. Research a new opportunity or use publicationMode update.`);
  }
  const allowedInternalHrefs = new Set(["/", ...pages.map((page) => page.path)]);
  const invalidInternalLink = (draft.internalLinks || []).find((link) => !allowedInternalHrefs.has(link.href));
  if (invalidInternalLink) throw new Error(`Internal link target is not a published route: ${invalidInternalLink.href}`);
  if (pages.length > 0 && !(draft.internalLinks || []).some((link) => link.href !== "/")) {
    throw new Error("The new page needs at least one contextual link to a published first-party page");
  }
  const nearest = pages
    .filter((page) => page.slug !== pageSlug)
    .map((page) => ({ slug: page.slug, score: similarity(pageText(page), pageText(draft)) }))
    .sort((left, right) => right.score - left.score)[0];
  if (nearest?.score >= policy.content.maxSimilarity) {
    throw new Error(`Draft is too similar to /${nearest.slug} (${Math.round(nearest.score * 100)}%).`);
  }
  return { draft, opportunity, pageSlug };
});

const draft = preparedDrafts[0]?.draft ?? null;
const selectedOpportunity = preparedDrafts[0]?.opportunity ?? opportunities.find((candidate) => candidate.action === "create_page") ?? opportunities[0];
if (!selectedOpportunity) throw new Error("Research produced no scored opportunity");
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
const funnel = validateFunnel(input.funnel);
const checkedAt = new Date().toISOString();
const reportId = `seo-${date}`;
const publication = !draft
  ? { status: "not_requested", reason: "No draft was supplied for editorial review." }
  : draft.quality.passed
    ? { status: "ready_for_review", slug: preparedDrafts[0].pageSlug, path: `/${preparedDrafts[0].pageSlug}`, draftDigest: sha256(draft), reason: "Automated gates passed. A separate editorial approval record bound to this draft digest is required before publication." }
    : { status: "blocked", reason: "Draft did not pass all automated quality gates." };
const phrase = titleCase(selectedOpportunity.keyword);
const pageType = /how|what|ideas|guide/.test(selectedOpportunity.keyword) ? "guide" : /romance|fantasy|mystery|school|life/.test(selectedOpportunity.keyword) ? "scenario" : "product";
const allFunnelObserved = Object.values(funnel.metrics).every((metric) => metric.status === "observed");

const report = {
  id: reportId,
  date,
  publicationMode: input.publicationMode === "update" ? "update" : "create",
  generatedAt: input.generatedAt || checkedAt,
  mode: performance.length && allFunnelObserved ? "live" : "partial",
  headline: `Today's revenue-first priority: ${selectedOpportunity.action === "improve_page" ? "improve" : "create"} - ${selectedOpportunity.keyword}`,
  summary: {
    candidatesAnalyzed: input.candidates.length,
    publishableOpportunities: opportunities.filter((row) => row.action === "create_page").length,
    totalClicks: totals.clicks,
    totalImpressions: totals.impressions,
    averageCtr: totals.impressions ? totals.clicks / totals.impressions : 0,
  },
  opportunities,
  performance,
  funnel,
  publication,
  publications: [publication],
  actions: [
    { priority: "P0", action: `Prepare a fact-constrained English page for \"${selectedOpportunity.keyword}\"`, why: selectedOpportunity.reason, expectedImpact: "Target a specific searcher who is close to trial or purchase." },
    { priority: "P1", action: "Verify evidence, intent, and conversion hypothesis", why: "Research proxies rank options; they do not replace observed search or revenue data.", expectedImpact: "Prevent broad traffic from displacing qualified product demand." },
    { priority: "P2", action: publication.status === "ready_for_review" ? `Independently review ${publication.path} before publishing` : "Resolve the failed publication gate", why: publication.reason, expectedImpact: "Keep editorial approval separate from generation." },
  ],
  brief: {
    keyword: selectedOpportunity.keyword,
    slug: `/${slugify(selectedOpportunity.keyword)}`,
    pageType,
    searchIntent: selectedOpportunity.intent,
    title: `${phrase} | Enter a Story and Choose a Role`,
    description: `Explore ${selectedOpportunity.keyword} through an existing story plot and an available role.`,
    h1: phrase,
    primaryCta: "Explore stories on NovelAI",
    sections: ["Answer the searcher job", "Show the story entry path", "Explain role selection", "Resolve the decision barrier", "Offer a measured next step"],
    evidenceRequired: ["Public evidence for the intent", "Approved product facts", "Original non-infringing material", "Verified CTA and attribution route"],
    qualityGate: ["One intent and one H1", "Trial and revenue gates passed", "No unlicensed third-party IP", "Independent editorial review", "Render, link, and index checks"],
  },
  draft,
  drafts: preparedDrafts.map((prepared) => prepared.draft),
  contentStrategy,
  integrations: [
    { id: "semrush", name: "SEO Research Tools", state: "configured", detail: "The shared GURU/PRO account is used for human-assisted keyword and competitor research; provider metrics must be labelled as observed when copied into evidence." },
    { id: "codex_research", name: "Codex Research", state: "connected", detail: `${input.evidence.length} public evidence links support ${input.candidates.length} candidates.`, lastCheckedAt: checkedAt },
    { id: "search_console", name: "Google Search Console", state: performance.length ? "connected" : "missing", detail: performance.length ? `${performance.length} visible query/page rows recorded.` : "No visible Search Console rows were available; no metrics were inferred.", href: "https://search.google.com/search-console", actionLabel: "Open Search Console" },
    { id: "ai_gateway", name: "Codex Content", state: draft ? "connected" : "configured", detail: draft ? "A fact-constrained draft is ready for a separate editorial review." : "Research is ready for drafting." },
    { id: "github", name: "GitHub Reports", state: "configured", detail: "Daily reports and approved pages are committed only after verification.", href: "https://github.com/lium53492-rgb/seo/tree/main/data/reports", actionLabel: "Open report history" },
    { id: "product_analytics", name: "Revenue Attribution", state: funnel.attributionStatus === "connected" ? "connected" : funnel.attributionStatus === "partial" ? "configured" : "missing", detail: funnel.attributionStatus === "connected" ? "Search and UV aggregate by source slug and period; outbound, trial, payment, and revenue events join by seo_click_id." : "The funnel records unavailable fields explicitly until NovelAI trial/payment callbacks are connected.", href: "https://vercel.com/elser1/seo/analytics", actionLabel: "Open analytics" },
  ],
  evidence: input.evidence.map((item) => {
    const url = new URL(item.url);
    return { title: String(item.title || url.hostname), url: url.toString(), source: String(item.source || url.hostname), collectedAt: item.collectedAt || checkedAt, supports: Array.isArray(item.supports) ? item.supports.map(String) : [] };
  }),
  caveats: [
    "Demand and difficulty are transparent 0-100 research proxies unless an evidence record explicitly names an observed provider metric.",
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
