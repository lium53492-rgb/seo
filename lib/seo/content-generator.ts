import "server-only";

import { generateText, gateway, Output } from "ai";
import { z } from "zod";
import { productConstraints, productFacts } from "./product-facts";
import type {
  GeneratedPageDraft,
  KeywordCandidate,
  PageBrief,
} from "./types";

const draftSchema = z.object({
  title: z
    .string()
    .min(20)
    .max(60)
    .describe("SEO title, 60 characters or fewer, containing the target keyword naturally"),
  metaDescription: z
    .string()
    .min(90)
    .max(160)
    .describe("Search description, 160 characters or fewer"),
  h1: z.string().min(10).max(90),
  heroMarkdown: z.string().min(120).max(900),
  primaryCta: z.string().min(3).max(45),
  sections: z
    .array(
      z.object({
        heading: z.string().min(8).max(90),
        bodyMarkdown: z.string().min(180).max(1800),
      }),
    )
    .min(4)
    .max(7),
  faqs: z
    .array(
      z.object({
        question: z.string().min(10).max(120),
        answerMarkdown: z.string().min(60).max(700),
      }),
    )
    .min(3)
    .max(6),
  factIdsUsed: z.array(z.string()).min(2),
  internalLinks: z
    .array(
      z.object({
        anchor: z.string().min(3).max(80),
        href: z.string().regex(/^\/[a-z0-9/#-]*$/),
      }),
    )
    .max(4),
  assetBriefs: z.array(z.string().min(20).max(240)).min(2).max(4),
});

function normalizedText(value: string) {
  return value
    .replace(/[`*_>#\[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function draftText(draft: z.infer<typeof draftSchema>) {
  return [
    draft.title,
    draft.metaDescription,
    draft.h1,
    draft.heroMarkdown,
    ...draft.sections.flatMap((section) => [section.heading, section.bodyMarkdown]),
    ...draft.faqs.flatMap((faq) => [faq.question, faq.answerMarkdown]),
  ].join("\n");
}

function countWords(value: string) {
  return normalizedText(value).split(/\s+/).filter(Boolean).length;
}

async function selectContentModel() {
  const configured = process.env.SEO_CONTENT_MODEL;
  const available = await gateway.getAvailableModels();
  const languageModels = available.models.filter(
    (model) => !model.modelType || model.modelType === "language",
  );
  if (configured && languageModels.some((model) => model.id === configured)) {
    return configured;
  }

  const preferences = [
    "openai/gpt-5.5",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.4",
  ];
  const preferred = preferences.find((id) =>
    languageModels.some((model) => model.id === id),
  );
  const model = preferred ?? languageModels[0]?.id;
  if (!model) throw new Error("AI Gateway did not return an available language model");
  return model;
}

function qualityChecks(
  candidate: KeywordCandidate,
  draft: z.infer<typeof draftSchema>,
) {
  const keyword = candidate.keyword.toLowerCase();
  const text = draftText(draft);
  const lower = text.toLowerCase();
  const allowedFactIds = new Set(productFacts.map((fact) => fact.id));
  const allowedLinks = new Set(["/", "/#story-preview"]);
  const unsupportedPromise =
    /\b(free forever|no sign[- ]?up|unlimited|real[- ]?time|zero latency|millions? of players|best[- ]in[- ]class)\b/i;
  const wordCount = countWords(
    [
      draft.heroMarkdown,
      ...draft.sections.map((section) => section.bodyMarkdown),
      ...draft.faqs.map((faq) => faq.answerMarkdown),
    ].join(" "),
  );

  const checks = [
    {
      id: "keyword-title",
      label: "目标词进入标题",
      passed: draft.title.toLowerCase().includes(keyword),
      detail: `Title: ${draft.title.length}/60 characters`,
    },
    {
      id: "keyword-h1",
      label: "目标词进入 H1",
      passed: draft.h1.toLowerCase().includes(keyword),
      detail: "H1 must express the same search intent without keyword stuffing.",
    },
    {
      id: "meta-length",
      label: "搜索描述长度",
      passed:
        draft.metaDescription.length >= 90 && draft.metaDescription.length <= 160,
      detail: `${draft.metaDescription.length}/160 characters`,
    },
    {
      id: "content-depth",
      label: "正文深度",
      passed: wordCount >= 600 && wordCount <= 1400,
      detail: `${wordCount} words; target 600–1,400`,
    },
    {
      id: "fact-allowlist",
      label: "产品事实白名单",
      passed:
        draft.factIdsUsed.length >= 2 &&
        draft.factIdsUsed.every((id) => allowedFactIds.has(id)),
      detail: `${draft.factIdsUsed.length} approved fact references`,
    },
    {
      id: "unsupported-promises",
      label: "无虚构承诺",
      passed: !unsupportedPromise.test(text),
      detail: "Checks unverified pricing, scale, latency and availability promises.",
    },
    {
      id: "ip-risk",
      label: "第三方 IP 风险",
      passed: candidate.ipRisk <= 20,
      detail: `Candidate IP risk score: ${candidate.ipRisk}`,
    },
    {
      id: "internal-links",
      label: "内部链接白名单",
      passed: draft.internalLinks.every((link) => allowedLinks.has(link.href)),
      detail: "Only verified routes may be linked from generated copy.",
    },
    {
      id: "keyword-density",
      label: "避免关键词堆砌",
      passed: (lower.split(keyword).length - 1) <= 12,
      detail: `${lower.split(keyword).length - 1} exact keyword mentions`,
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    wordCount,
    checks,
  };
}

export async function generatePageDraft(
  candidate: KeywordCandidate,
  brief: PageBrief,
): Promise<GeneratedPageDraft> {
  const model = await selectContentModel();
  const prompt = [
    "You are producing an English SEO landing-page draft for an AI voice-roleplay product.",
    "This is a production content task. Be specific, useful and natural, but do not invent any product fact.",
    `Target keyword: ${candidate.keyword}`,
    `Search intent: ${candidate.intent}`,
    `Recommended page type: ${brief.pageType}`,
    `Recommended route: ${brief.slug}`,
    `Approved product facts:\n${productFacts
      .map((fact) => `- [${fact.id}] ${fact.statement} Source: ${fact.source}`)
      .join("\n")}`,
    `Hard constraints:\n${productConstraints.map((item) => `- ${item}`).join("\n")}`,
    "Only cite fact IDs from the approved list in factIdsUsed.",
    "The only allowed internal links are / and /#story-preview.",
    "Write 600–1,000 words across the hero, sections and FAQs. Use concise Markdown in body fields.",
    "Explain the story-first role selection experience clearly. Avoid generic AI filler and keyword stuffing.",
    "Asset briefs must request original, non-infringing product visuals and must not claim those assets already exist.",
  ].join("\n\n");

  const result = await generateText({
    model,
    output: Output.object({
      name: "seoLandingPageDraft",
      description: "A fact-constrained SEO landing page ready for editorial review",
      schema: draftSchema,
    }),
    prompt,
    maxOutputTokens: 5_500,
    providerOptions: {
      gateway: {
        user: "seo-growth-workbench",
        tags: ["feature:seo-content", `keyword:${candidate.keyword}`],
        disallowPromptTraining: true,
      },
    },
  });
  if (!result.output) throw new Error("AI Gateway returned no structured page draft");

  const quality = qualityChecks(candidate, result.output);
  const usage = result.totalUsage;
  return {
    keyword: candidate.keyword,
    slug: brief.slug,
    language: "en",
    model,
    generatedAt: new Date().toISOString(),
    status: quality.passed ? "ready_for_review" : "blocked",
    reviewRequired: true,
    ...result.output,
    quality,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
  };
}
