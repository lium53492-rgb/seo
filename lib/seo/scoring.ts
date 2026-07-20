import type {
  KeywordCandidate,
  RecommendedAction,
  SearchIntent,
} from "./types";

type ScorableCandidate = Omit<KeywordCandidate, "score" | "action" | "reason">;

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

function demandScore(volume: number) {
  return clamp((Math.log10(Math.max(1, volume)) / 4) * 100);
}

function trendScore(trend: number[]) {
  if (trend.length < 4) return 50;
  const split = Math.floor(trend.length / 2);
  const previous = trend.slice(0, split);
  const recent = trend.slice(split);
  const mean = (values: number[]) =>
    values.reduce((total, value) => total + value, 0) / values.length;
  const baseline = Math.max(0.01, mean(previous));
  const growth = (mean(recent) - baseline) / baseline;
  return clamp(50 + growth * 45);
}

function chooseAction(candidate: ScorableCandidate, score: number): RecommendedAction {
  if (candidate.cannibalizationRisk >= 60) return "consolidate";
  if (candidate.existingUrl) return score >= 58 ? "improve_page" : "observe";
  return score >= 62 ? "create_page" : "observe";
}

function describeReason(candidate: ScorableCandidate, score: number) {
  const reasons: string[] = [];
  if (candidate.productFit >= 90) reasons.push("与语C产品高度匹配");
  if (candidate.difficulty <= 30) {
    reasons.push(
      candidate.metricBasis === "research_proxy"
        ? "公开结果竞争代理较低"
        : "竞争难度相对较低",
    );
  }
  if (
    candidate.metricBasis === "research_proxy" &&
    (candidate.demandScore ?? 0) >= 65
  ) {
    reasons.push("多来源需求信号较强");
  }
  if (trendScore(candidate.trend) >= 65) reasons.push("近期需求向上");
  if (candidate.conversionIntent >= 85) reasons.push("接近开始游戏的商业意图");
  if (candidate.cannibalizationRisk >= 30) reasons.push("需处理关键词蚕食");
  if (candidate.ipRisk > 20) reasons.push("存在 IP 风险");
  return `${reasons.slice(0, 3).join("，") || "需要继续观察"}；综合机会分 ${score}。`;
}

export function scoreCandidate(candidate: ScorableCandidate): KeywordCandidate {
  const demand =
    candidate.metricBasis === "research_proxy"
      ? clamp(candidate.demandScore ?? 0)
      : demandScore(candidate.volume);
  const score = Math.round(
    clamp(
      candidate.productFit * 0.28 +
        candidate.originality * 0.14 +
        candidate.conversionIntent * 0.16 +
        demand * 0.14 +
        (100 - candidate.difficulty) * 0.17 +
        trendScore(candidate.trend) * 0.11 -
        candidate.ipRisk * 0.18 -
        candidate.cannibalizationRisk * 0.12,
    ),
  );
  const action = chooseAction(candidate, score);
  return {
    ...candidate,
    score,
    action,
    reason: describeReason(candidate, score),
  };
}

export function intentFromSemrush(
  value: string | string[] | undefined,
): SearchIntent {
  const intents = (Array.isArray(value) ? value : value?.split(",") ?? [])
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (intents.length > 1) return "mixed";
  const intentMap = {
    COMMERCIAL: "commercial",
    INFORMATIONAL: "informational",
    NAVIGATIONAL: "navigational",
    TRANSACTIONAL: "transactional",
    "0": "commercial",
    "1": "informational",
    "2": "navigational",
    "3": "transactional",
  } as const;
  return intentMap[intents[0] as keyof typeof intentMap] ?? "mixed";
}

export function scoreCandidates(candidates: ScorableCandidate[]) {
  return candidates.map(scoreCandidate).sort((a, b) => b.score - a.score);
}
