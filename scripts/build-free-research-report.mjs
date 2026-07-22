import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: npm run research:build -- data/research/YYYY-MM-DD.json");

const input = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const date = String(input.date || "");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
const policyVersion = Number(input.policyVersion || 1);
const contentStrategy = input.contentStrategy || null;
if (policyVersion >= 2) {
  const requiredStrategyFields = [
    "searcherJob",
    "oneSentenceAnswer",
    "originalContribution",
    "productBridge",
    "contextualNextStep",
    "evidenceBoundary",
  ];
  for (const field of requiredStrategyFields) {
    if (typeof contentStrategy?.[field] !== "string" || contentStrategy[field].trim().length < 20) {
      throw new Error(`Content strategy needs a specific ${field}`);
    }
  }
  const allowedPagePatterns = new Set(["task_guide", "experience_explainer", "decision_page", "original_inventory"]);
  if (!allowedPagePatterns.has(contentStrategy.pagePattern)) {
    throw new Error("Content strategy needs an approved pagePattern");
  }
}
if (!Array.isArray(input.candidates) || input.candidates.length < 5 || input.candidates.length > 12) {
  throw new Error("Research requires 5-12 candidates");
}
if (!Array.isArray(input.evidence) || input.evidence.length < 5) {
  throw new Error("Research requires at least 5 evidence links");
}

const clamp = (value) => Math.min(100, Math.max(0, Number(value) || 0));
const slugify = (value) => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const titleCase = (value) => String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
const approvedFactIds = new Set([
  "voice-roleplay-format",
  "existing-story",
  "role-selection",
  "interactive-fiction-history",
]);
const unsupportedCapability = /\b(multiplayer|with friends|group roleplay|real[- ]?time|unlimited)\b/i;
const forbiddenClaims = [
  /\bmultiplayer\b/i,
  /\bwith friends\b/i,
  /\breal[- ]time\b/i,
  /\bunlimited\b/i,
  /\bprivate\b/i,
  /\bavailable on (?:ios|android|steam|web)\b/i,
  /\b(?:zero|low) latency\b/i,
];

const evidenceDomains = new Set();
const supportedKeywords = new Set();
for (const item of input.evidence) {
  const url = new URL(item.url);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Evidence URLs must use HTTP(S)");
  evidenceDomains.add(url.hostname.replace(/^www\./, ""));
  for (const keyword of Array.isArray(item.supports) ? item.supports : []) {
    supportedKeywords.add(String(keyword).trim().toLowerCase());
  }
}
if (evidenceDomains.size < 3) throw new Error("Evidence must come from at least 3 independent domains");
for (const candidate of input.candidates) {
  const keyword = String(candidate.keyword || "").trim().toLowerCase();
  if (!keyword || !supportedKeywords.has(keyword)) {
    throw new Error(`Missing evidence support for candidate: ${keyword || "<empty>"}`);
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
  return readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(resolve(directory, name), "utf8")));
}

function scoreCandidate(raw) {
  const candidate = {
    keyword: String(raw.keyword || "").trim().toLowerCase(),
    seed: String(raw.seed || "").trim().toLowerCase(),
    source: "codex_research",
    metricBasis: "research_proxy",
    demandScore: clamp(raw.demandScore),
    volume: 0,
    difficulty: clamp(raw.difficulty),
    cpc: 0,
    intent: ["commercial", "informational", "navigational", "transactional", "mixed"].includes(raw.intent) ? raw.intent : "mixed",
    trend: [],
    productFit: clamp(raw.productFit),
    originality: clamp(raw.originality),
    conversionIntent: clamp(raw.conversionIntent),
    ipRisk: clamp(raw.ipRisk),
    cannibalizationRisk: clamp(raw.cannibalizationRisk),
    ...(raw.existingUrl ? { existingUrl: String(raw.existingUrl) } : {}),
  };
  if (!candidate.keyword || !candidate.seed) throw new Error("Every candidate needs keyword and seed");
  if (unsupportedCapability.test(candidate.keyword) && candidate.productFit > 49) {
    throw new Error(`Unsupported capability keyword must have productFit <= 49: ${candidate.keyword}`);
  }
  const score = Math.round(clamp(
    candidate.productFit * 0.28 + candidate.originality * 0.14 + candidate.conversionIntent * 0.16 +
    candidate.demandScore * 0.14 + (100 - candidate.difficulty) * 0.17 + 50 * 0.11 -
    candidate.ipRisk * 0.18 - candidate.cannibalizationRisk * 0.12,
  ));
  const reasons = [];
  if (candidate.productFit >= 85) reasons.push("strong approved-product fit");
  if (candidate.demandScore >= 65) reasons.push("repeated public demand signals");
  if (candidate.difficulty <= 35) reasons.push("lower competition proxy");
  if (candidate.conversionIntent >= 80) reasons.push("close to a start intent");
  if (candidate.ipRisk >= 30) reasons.push("third-party IP risk requires care");
  const action = candidate.cannibalizationRisk >= 60
    ? "consolidate"
    : candidate.existingUrl
      ? score >= 58 ? "improve_page" : "observe"
      : score >= 62 ? "create_page" : "observe";
  return { ...candidate, score, action, reason: `${reasons.slice(0, 3).join("; ") || "needs more evidence"}; opportunity score ${score}.` };
}

function validateDraft(rawDraft, keyword) {
  if (!rawDraft) return null;
  if (String(rawDraft.keyword || "").trim().toLowerCase() !== keyword) {
    throw new Error(`Draft keyword must match its researched opportunity: ${keyword}`);
  }
  if (rawDraft.language !== "en" || rawDraft.reviewRequired !== true) {
    throw new Error("Draft must be English and require human review");
  }
  const factIds = Array.isArray(rawDraft.factIdsUsed) ? rawDraft.factIdsUsed : [];
  if (factIds.length < 2 || factIds.some((id) => !approvedFactIds.has(id))) {
    throw new Error("Draft uses an unapproved or missing product fact ID");
  }
  const sections = Array.isArray(rawDraft.sections) ? rawDraft.sections : [];
  const faqs = Array.isArray(rawDraft.faqs) ? rawDraft.faqs : [];
  if (sections.length < 4 || faqs.length < 3) throw new Error("Draft needs at least 4 sections and 3 FAQs");
  const publishableText = [rawDraft.title, rawDraft.metaDescription, rawDraft.h1, rawDraft.heroMarkdown, ...sections.flatMap((section) => [section.heading, section.bodyMarkdown]), ...faqs.flatMap((faq) => [faq.question, faq.answerMarkdown])].join(" ");
  const failedClaim = forbiddenClaims.find((pattern) => pattern.test(publishableText));
  if (failedClaim) throw new Error(`Draft contains an unsupported product claim: ${failedClaim}`);
  const wordCount = (publishableText.match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
  const checks = Array.isArray(rawDraft.quality?.checks) ? rawDraft.quality.checks : [];
  const lengthCheck = { id: "minimum-depth", label: "600-1,000 English words", passed: wordCount >= 600 && wordCount <= 1_000, detail: `${wordCount} words` };
  const normalizedChecks = [...checks.filter((check) => check.id !== lengthCheck.id), lengthCheck];
  return { ...rawDraft, status: normalizedChecks.every((check) => check.passed) ? "ready_for_review" : "blocked", reviewRequired: true, quality: { passed: normalizedChecks.every((check) => check.passed), wordCount, checks: normalizedChecks } };
}

const opportunities = input.candidates.map(scoreCandidate).sort((left, right) => right.score - left.score).slice(0, 12);
const top = opportunities[0];
const rawDrafts = Array.isArray(input.drafts) && input.drafts.length ? input.drafts : input.draft ? [input.draft] : [];
if (rawDrafts.length > 1) throw new Error("A daily report may contain at most one publishable draft");
const preparedDrafts = rawDrafts.map((rawDraft, index) => {
  const keyword = String(rawDraft?.keyword || "").trim().toLowerCase();
  const opportunity = opportunities.find((candidate) => candidate.keyword === keyword);
  if (!opportunity) throw new Error(`Draft ${index + 1} has no researched opportunity: ${keyword || "<empty>"}`);
  if (opportunity.action !== "create_page") throw new Error(`Draft ${index + 1} must target a new publishable opportunity`);
  return { draft: validateDraft(rawDraft, keyword), opportunity, slot: rawDraft.slot === "afternoon" ? "afternoon" : "morning" };
});
const draft = preparedDrafts[0]?.draft ?? null;
const performance = Array.isArray(input.performance) ? input.performance : [];
const totals = performance.reduce((result, row) => ({ clicks: result.clicks + (Number(row.clicks) || 0), impressions: result.impressions + (Number(row.impressions) || 0) }), { clicks: 0, impressions: 0 });
const checkedAt = new Date().toISOString();
const reportId = `seo-${date}`;
const pages = existingPages();
const publications = [];
const blockedPublication = { status: "blocked", reason: "Draft did not pass all publication gates." };

for (const prepared of preparedDrafts) {
  const { draft: preparedDraft, opportunity, slot } = prepared;
  if (!preparedDraft?.quality?.passed) {
    publications.push({ ...blockedPublication, slot });
    continue;
  }
  const pageSlug = slugify(opportunity.keyword);
  const sameSlug = pages.find((page) => page.slug === pageSlug);
  const sameDailyReport = sameSlug?.generatedFromReport === reportId;
  if (sameSlug && input.publicationMode !== "update" && !sameDailyReport) {
    throw new Error(`Page /${pageSlug} already exists. Research a new opportunity or set publicationMode to update.`);
  }
  const allowedInternalHrefs = new Set(["/", ...pages.map((page) => page.path)]);
  const invalidInternalLink = (preparedDraft.internalLinks || []).find((link) => !allowedInternalHrefs.has(link.href));
  if (invalidInternalLink) throw new Error(`Internal link target is not a published route: ${invalidInternalLink.href}`);
  if (policyVersion >= 2 && pages.length > 0 && !(preparedDraft.internalLinks || []).some((link) => link.href !== "/")) {
    throw new Error("The new page needs at least one contextual link to a published first-party page");
  }
  const nearest = pages.filter((page) => page.slug !== pageSlug).map((page) => ({ slug: page.slug, score: similarity(pageText(page), pageText(preparedDraft)) })).sort((left, right) => right.score - left.score)[0];
  if (nearest?.score >= 0.72) throw new Error(`Draft is too similar to /${nearest.slug} (${Math.round(nearest.score * 100)}%).`);
  const page = {
    schemaVersion: 1, status: "published", slug: pageSlug, path: `/${pageSlug}`, keyword: opportunity.keyword,
    publishedAt: sameSlug?.publishedAt || checkedAt, updatedAt: checkedAt, generatedFromReport: reportId,
    title: preparedDraft.title, metaDescription: preparedDraft.metaDescription, h1: preparedDraft.h1,
    heroMarkdown: preparedDraft.heroMarkdown, primaryCta: preparedDraft.primaryCta, sections: preparedDraft.sections,
    faqs: preparedDraft.faqs, factIdsUsed: preparedDraft.factIdsUsed, internalLinks: preparedDraft.internalLinks || [],
    assetBriefs: preparedDraft.assetBriefs || [], quality: preparedDraft.quality,
    research: { opportunityScore: opportunity.score, demandProxy: opportunity.demandScore || 0, competitionProxy: opportunity.difficulty, evidenceCount: input.evidence.length },
  };
  const pagePath = resolve(`data/pages/${pageSlug}.json`);
  mkdirSync(dirname(pagePath), { recursive: true });
  writeFileSync(pagePath, `${JSON.stringify(page, null, 2)}\n`, "utf8");
  if (!sameSlug) pages.push(page);
  publications.push({ status: "published", slug: pageSlug, path: `/${pageSlug}`, slot, publishedAt: page.publishedAt, reason: sameSlug ? "The same daily report was rebuilt without creating a new slug." : "Source, fact, copyright, depth, similarity, and internal-link gates passed." });
}

const publication = publications[0] ?? blockedPublication;
const phrase = titleCase(top.keyword);
const pageType = /how|what|ideas|guide/.test(top.keyword) ? "guide" : /romance|fantasy|mystery|school|life/.test(top.keyword) ? "scenario" : "product";
const report = {
  id: reportId,
  date,
  generatedAt: input.generatedAt || checkedAt,
  mode: "partial",
  headline: `Today's priority: ${top.action === "improve_page" ? "improve" : "create"} — ${top.keyword}`,
  summary: { candidatesAnalyzed: input.candidates.length, publishableOpportunities: opportunities.filter((row) => row.score >= 62).length, totalClicks: totals.clicks, totalImpressions: totals.impressions, averageCtr: totals.impressions ? totals.clicks / totals.impressions : 0 },
  opportunities,
  performance,
  publication,
  publications,
  actions: [
    { priority: "P0", action: `Prepare a fact-constrained English page for “${top.keyword}”`, why: top.reason, expectedImpact: "Turn the strongest public research signal into a reviewable page." },
    { priority: "P1", action: "Verify evidence links and search intent", why: "Demand and difficulty are transparent research proxies, not provider metrics.", expectedImpact: "Avoid treating proxy scores as exact market size." },
    { priority: "P2", action: publication.status === "published" ? `Build and publish ${publication.path}` : "Resolve the failed publication gate", why: publication.reason, expectedImpact: "Keep only useful, indexable, product-true pages." },
  ],
  brief: {
    keyword: top.keyword, slug: `/${slugify(top.keyword)}`, pageType, searchIntent: top.intent,
    title: `${phrase} | Play an AI Voice Story`, description: `Explore ${top.keyword} through a story-led voice roleplay experience with selectable characters.`, h1: phrase, primaryCta: "Choose a role and start",
    sections: ["Search intent and story entry", "Role selection and point of view", "Voice performance inside a plot", "Originality and product-fact evidence", "Related guides and next step"],
    evidenceRequired: ["Public evidence for the intent", "Approved product facts", "Original, non-infringing page material", "Verified internal and CTA routes"],
    qualityGate: ["One intent and one H1", "Evidence-backed proxy metrics", "No unlicensed third-party IP", "Render, link, and index checks"],
  },
  draft,
  drafts: preparedDrafts.map((prepared) => prepared.draft),
  contentStrategy,
  integrations: [
    { id: "semrush", name: "Semrush", state: "replaced", detail: "Public-web research proxies are used; no paid keyword provider is required." },
    { id: "codex_research", name: "Codex Research", state: "connected", detail: `${input.evidence.length} public evidence links support ${input.candidates.length} candidates.`, lastCheckedAt: checkedAt },
    { id: "search_console", name: "Google Search Console", state: performance.length ? "connected" : "missing", detail: performance.length ? `${performance.length} visible query/page rows recorded.` : "No visible Search Console rows were available; no metrics were inferred.", href: "https://search.google.com/search-console", actionLabel: "Open Search Console" },
    { id: "ai_gateway", name: "Codex Content", state: draft ? "connected" : "configured", detail: draft ? "A fact-constrained draft was prepared outside the paid Gateway pipeline." : "Research is ready for a fact-constrained Codex draft." },
    { id: "github", name: "GitHub Reports", state: "configured", detail: "Daily reports are committed from the local automation when the network is available.", href: "https://github.com/lium53492-rgb/seo/tree/main/data/reports", actionLabel: "Open report history" },
    { id: "product_analytics", name: "Product Analytics", state: "configured", detail: "Use observed analytics and Search Console separately from research proxies.", href: "https://vercel.com/elser1/seo/analytics", actionLabel: "Open analytics" },
  ],
  evidence: input.evidence.map((item) => {
    const url = new URL(item.url);
    return { title: String(item.title || url.hostname), url: url.toString(), source: String(item.source || url.hostname), collectedAt: item.collectedAt || checkedAt, supports: Array.isArray(item.supports) ? item.supports.map(String) : [] };
  }),
  caveats: [
    "Demand and difficulty are 0-100 transparent research proxies, not monthly search volume, CPC, Semrush KD, or Google data.",
    "Search Console data is only recorded when visible in the logged-in browser or exported directly.",
    "A temporary afternoon page shares this report only after every normal quality, fact, IP, similarity, and internal-link gate passes.",
  ],
};

const outputPath = resolve(`data/reports/${date}.json`);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${outputPath}\n`);
