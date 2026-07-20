import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: npm run research:build -- data/research/YYYY-MM-DD.json");
}

const input = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const date = String(input.date || "");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
if (!Array.isArray(input.candidates) || input.candidates.length < 5) {
  throw new Error("At least 5 researched candidates are required");
}
if (!Array.isArray(input.evidence) || input.evidence.length < 5) {
  throw new Error("At least 5 evidence links are required");
}

const evidenceDomains = new Set();
const supportedKeywords = new Set();
for (const item of input.evidence) {
  const url = new URL(item.url);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("Evidence URLs must use HTTP(S)");
  }
  evidenceDomains.add(url.hostname.replace(/^www\./, ""));
  for (const keyword of Array.isArray(item.supports) ? item.supports : []) {
    supportedKeywords.add(String(keyword).trim().toLowerCase());
  }
}
if (evidenceDomains.size < 3) {
  throw new Error("Evidence must come from at least 3 independent domains");
}
for (const candidate of input.candidates) {
  const keyword = String(candidate.keyword || "").trim().toLowerCase();
  if (!supportedKeywords.has(keyword)) {
    throw new Error(`Missing evidence support for candidate: ${keyword || "<empty>"}`);
  }
}

const clamp = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number(value) || 0));
const slugify = (value) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const titleCase = (value) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());
const approvedFactIds = new Set([
  "voice-roleplay-format",
  "existing-story",
  "role-selection",
  "interactive-fiction-history",
]);

function validateDraft(rawDraft, topKeyword) {
  if (!rawDraft) return null;
  if (String(rawDraft.keyword || "").trim().toLowerCase() !== topKeyword) {
    throw new Error("Draft keyword must match the highest-scoring opportunity");
  }
  if (rawDraft.language !== "en" || rawDraft.reviewRequired !== true) {
    throw new Error("Draft must be English and require human review");
  }
  const factIds = Array.isArray(rawDraft.factIdsUsed) ? rawDraft.factIdsUsed : [];
  if (!factIds.length || factIds.some((id) => !approvedFactIds.has(id))) {
    throw new Error("Draft uses an unapproved or missing product fact ID");
  }
  const sections = Array.isArray(rawDraft.sections) ? rawDraft.sections : [];
  const faqs = Array.isArray(rawDraft.faqs) ? rawDraft.faqs : [];
  if (sections.length < 3 || faqs.length < 2) {
    throw new Error("Draft needs at least 3 sections and 2 FAQs");
  }
  const publishableText = [
    rawDraft.title,
    rawDraft.metaDescription,
    rawDraft.h1,
    rawDraft.heroMarkdown,
    ...sections.flatMap((section) => [section.heading, section.bodyMarkdown]),
    ...faqs.flatMap((faq) => [faq.question, faq.answerMarkdown]),
  ].join(" ");
  const forbiddenClaims = [
    /\bmultiplayer\b/i,
    /\bwith friends\b/i,
    /\breal[- ]time\b/i,
    /\bunlimited\b/i,
    /\bprivate\b/i,
    /\bavailable on (?:ios|android|steam|web)\b/i,
    /\b(?:zero|low) latency\b/i,
  ];
  const failedClaim = forbiddenClaims.find((pattern) => pattern.test(publishableText));
  if (failedClaim) {
    throw new Error(`Draft contains an unsupported product claim: ${failedClaim}`);
  }
  const wordCount = (publishableText.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
  const checks = Array.isArray(rawDraft.quality?.checks) ? rawDraft.quality.checks : [];
  const lengthCheck = {
    id: "minimum-depth",
    label: "页面内容达到最低深度",
    passed: wordCount >= 350,
    detail: `可发布正文与 FAQ 共 ${wordCount} 个英文词。`,
  };
  const normalizedChecks = [
    ...checks.filter((check) => check.id !== lengthCheck.id),
    lengthCheck,
  ];
  return {
    ...rawDraft,
    status: normalizedChecks.every((check) => check.passed)
      ? "ready_for_review"
      : "blocked",
    reviewRequired: true,
    quality: {
      passed: normalizedChecks.every((check) => check.passed),
      wordCount,
      checks: normalizedChecks,
    },
  };
}

function chooseAction(candidate, score) {
  if (candidate.cannibalizationRisk >= 60) return "consolidate";
  if (candidate.existingUrl) return score >= 58 ? "improve_page" : "observe";
  return score >= 62 ? "create_page" : "observe";
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
    intent: ["commercial", "informational", "navigational", "transactional", "mixed"].includes(raw.intent)
      ? raw.intent
      : "mixed",
    trend: [],
    productFit: clamp(raw.productFit),
    originality: clamp(raw.originality),
    conversionIntent: clamp(raw.conversionIntent),
    ipRisk: clamp(raw.ipRisk),
    cannibalizationRisk: clamp(raw.cannibalizationRisk),
    ...(raw.existingUrl ? { existingUrl: String(raw.existingUrl) } : {}),
  };
  if (!candidate.keyword || !candidate.seed) throw new Error("Every candidate needs keyword and seed");

  const score = Math.round(clamp(
    candidate.productFit * 0.28 +
      candidate.originality * 0.14 +
      candidate.conversionIntent * 0.16 +
      candidate.demandScore * 0.14 +
      (100 - candidate.difficulty) * 0.17 +
      50 * 0.11 -
      candidate.ipRisk * 0.18 -
      candidate.cannibalizationRisk * 0.12,
  ));
  const reasons = [];
  if (candidate.productFit >= 85) reasons.push("与语C产品高度匹配");
  if (candidate.demandScore >= 65) reasons.push("多来源需求信号较强");
  if (candidate.difficulty <= 35) reasons.push("公开结果竞争代理较低");
  if (candidate.conversionIntent >= 80) reasons.push("接近开始体验的意图");
  if (candidate.ipRisk >= 30) reasons.push("存在第三方 IP 风险");

  return {
    ...candidate,
    score,
    action: chooseAction(candidate, score),
    reason: `${reasons.slice(0, 3).join("，") || "需要继续观察"}；综合机会分 ${score}。`,
  };
}

const opportunities = input.candidates
  .map(scoreCandidate)
  .sort((left, right) => right.score - left.score)
  .slice(0, 12);
const top = opportunities[0];
const draft = validateDraft(input.draft, top.keyword);
const phrase = titleCase(top.keyword);
const pageType = /how|what|ideas|guide/.test(top.keyword)
  ? "guide"
  : /romance|fantasy|mystery|school|life|multiplayer/.test(top.keyword)
    ? "scenario"
    : "product";
const performance = Array.isArray(input.performance) ? input.performance : [];
const totals = performance.reduce(
  (result, row) => ({
    clicks: result.clicks + (Number(row.clicks) || 0),
    impressions: result.impressions + (Number(row.impressions) || 0),
  }),
  { clicks: 0, impressions: 0 },
);
const checkedAt = new Date().toISOString();
const report = {
  id: `seo-${date}`,
  date,
  generatedAt: input.generatedAt || checkedAt,
  mode: "partial",
  headline: `今日优先动作：${top.action === "improve_page" ? "升级" : "创建"}“${top.keyword}”`,
  summary: {
    candidatesAnalyzed: input.candidates.length,
    publishableOpportunities: opportunities.filter((row) => row.score >= 62).length,
    totalClicks: totals.clicks,
    totalImpressions: totals.impressions,
    averageCtr: totals.impressions ? totals.clicks / totals.impressions : 0,
  },
  opportunities,
  performance,
  actions: [
    {
      priority: "P0",
      action: `为“${top.keyword}”准备事实受控的英文页面`,
      why: top.reason,
      expectedImpact: "把免费公开研究中最可信的机会转成可审核页面任务。",
    },
    {
      priority: "P1",
      action: "人工核对证据链接与搜索意图",
      why: "免费模式使用代理指标，不提供供应商月搜索量或 KD。",
      expectedImpact: "避免把代理分误读为精确市场规模。",
    },
    {
      priority: "P2",
      action: "确认剧情、角色、语音能力与原创素材后再发布",
      why: "研究信号不能替代第一手产品证据。",
      expectedImpact: "降低低价值内容和虚假产品承诺风险。",
    },
  ],
  brief: {
    keyword: top.keyword,
    slug: `/${slugify(top.keyword)}`,
    pageType,
    searchIntent: top.intent,
    title: `${phrase} | Play an AI Voice Story`,
    description: `Explore ${top.keyword} through a story-led voice roleplay experience with selectable characters.`,
    h1: phrase,
    primaryCta: "Choose a role and start",
    sections: [
      "剧情开场与搜索意图",
      "可选择角色和各自目标",
      "语音互动如何推动剧情",
      "真实试玩证据与原创素材",
      "相关剧情与下一步入口",
    ],
    evidenceRequired: [
      "至少 1 个真实可玩的公开剧情",
      "产品团队确认的全部可选角色或角色视角",
      "产品团队确认的语音能力",
      "原创视觉、语音或试玩素材",
    ],
    qualityGate: [
      "一个明确搜索意图和一个 H1",
      "代理指标明确标注且保留证据链接",
      "不使用未经授权的第三方 IP",
      "通过移动端、链接和索引检查",
    ],
  },
  draft,
  integrations: [
    { id: "semrush", name: "Semrush", state: "replaced", detail: "已由 Codex 公开网页研究替代；无需购买也能每天更新" },
    { id: "codex_research", name: "Codex Research", state: "connected", detail: `已验证 ${input.evidence.length} 条公开证据并评分 ${input.candidates.length} 个候选词`, lastCheckedAt: checkedAt },
    { id: "search_console", name: "Google Search Console", state: performance.length ? "connected" : "missing", detail: performance.length ? `已合并 ${performance.length} 行真实搜索表现` : "站点入口已准备，等待 Google 账号授权", href: "https://search.google.com/search-console", actionLabel: performance.length ? "打开 Search Console" : "去 Google 授权" },
    { id: "ai_gateway", name: "Codex Content", state: draft ? "connected" : "configured", detail: draft ? "本次日报包含通过事实约束检查的英文草稿" : "研究完成；内容草稿可由 Codex 审核后生成" },
    { id: "github", name: "GitHub Reports", state: "connected", detail: "日报由 Codex 自动化提交到 data/reports", href: "https://github.com/lium53492-rgb/seo/tree/main/data/reports", actionLabel: "查看日报文件" },
    { id: "product_analytics", name: "Product Analytics", state: "configured", detail: "Vercel 页面访问采集代码已接入；等待控制台启用，Hobby 免费版不含自定义事件", href: "https://vercel.com/elser1/seo/analytics", actionLabel: "启用免费统计" },
  ],
  evidence: input.evidence.map((item) => {
    const url = new URL(item.url);
    return {
      title: String(item.title || url.hostname),
      url: url.toString(),
      source: String(item.source || url.hostname),
      collectedAt: item.collectedAt || checkedAt,
      supports: Array.isArray(item.supports) ? item.supports.map(String) : [],
    };
  }),
  caveats: [
    "免费研究模式不提供月搜索量、CPC 或 Semrush KD；需求分和竞争分均为 0–100 代理指标。",
    "代理分依据公开搜索结果的重复出现、近期性、用户讨论和头部结果强度计算，结果会随网页变化。",
    "所有发布建议都必须经过人工产品事实与版权审核。",
  ],
};

const outputPath = resolve(`data/reports/${date}.json`);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${outputPath}\n`);
