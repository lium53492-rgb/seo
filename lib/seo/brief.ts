import type { KeywordCandidate, PageBrief } from "./types";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildPageBrief(candidate: KeywordCandidate): PageBrief {
  const phrase = titleCase(candidate.keyword);
  const pageType = /how|what|ideas|guide/.test(candidate.keyword)
    ? "guide"
    : /romance|fantasy|mystery|school|life|multiplayer/.test(candidate.keyword)
      ? "scenario"
      : "product";

  return {
    keyword: candidate.keyword,
    slug: `/${slugify(candidate.keyword)}`,
    pageType,
    searchIntent: candidate.intent,
    title: `${phrase} | Play an AI Voice Story`,
    description: `Enter a ${candidate.keyword} experience with selectable roles, spoken scenes, and an interactive story shaped by every player.`,
    h1: phrase,
    primaryCta: "Choose a role and start",
    sections: [
      "可试玩的剧情开场，而不是泛泛概念介绍",
      "玩家可以选择的角色与每个角色的目标",
      "语音互动如何推动剧情分支",
      "真实语音片段或匿名玩法数据",
      "相关剧情、角色与下一步入口",
    ],
    evidenceRequired: [
      "至少 1 个真实可玩的公开剧情",
      "至少 3 个可选择角色或角色视角",
      "产品团队确认的语音与多人能力",
      "原创视觉、语音或试玩素材",
    ],
    qualityGate: [
      "一个明确搜索意图和一个 H1",
      "首屏 5 秒内解释玩法并提供 CTA",
      "不使用未经授权的第三方 IP",
      "canonical 指向当前页面自身",
      "通过构建、移动端、链接和索引检查",
    ],
  };
}
