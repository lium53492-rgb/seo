import "server-only";

import { parseDelimited } from "../csv";
import { intentFromSemrush } from "../scoring";
import type { KeywordCandidate } from "../types";

type RawCandidate = Omit<KeywordCandidate, "score" | "action" | "reason">;

const DEFAULT_SEEDS = ["voice roleplay", "ai roleplay game", "ai story game"];

function trendValues(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map(Number)
    .filter(Number.isFinite);
}

function keywordHeuristics(keyword: string) {
  const normalized = keyword.toLowerCase();
  const hasProductTerms = /voice|roleplay|story|character|game|cosplay/.test(normalized);
  const highIntent = /game|chat|play|app|simulator/.test(normalized);
  const possibleIp = /harry potter|marvel|disney|pokemon|genshin|naruto/.test(normalized);

  return {
    productFit: hasProductTerms ? 88 : 55,
    originality: normalized.split(" ").length >= 3 ? 84 : 68,
    conversionIntent: highIntent ? 86 : 68,
    ipRisk: possibleIp ? 85 : 0,
    cannibalizationRisk: normalized === "voice roleplay" ? 45 : 10,
  };
}

export async function fetchSemrushCandidates(): Promise<RawCandidate[]> {
  const apiKey = process.env.SEMRUSH_API_KEY;
  if (!apiKey) return [];

  const database = process.env.SEMRUSH_DATABASE || "us";
  const rowLimit = Math.min(
    20,
    Math.max(3, Number(process.env.SEMRUSH_ROWS_PER_SEED || "8")),
  );
  const seeds = (process.env.SEO_KEYWORD_SEEDS || DEFAULT_SEEDS.join(","))
    .split(",")
    .map((seed) => seed.trim())
    .filter(Boolean)
    .slice(0, 5);

  const results = await Promise.all(
    seeds.map(async (seed) => {
      const params = new URLSearchParams({
        type: "phrase_related",
        key: apiKey,
        phrase: seed,
        database,
        display_limit: String(rowLimit),
        display_sort: "kd_asc",
        export_columns: "Ph,Nq,Cp,Kd,Td,Rr,In",
      });
      const response = await fetch(`https://api.semrush.com/?${params}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.text();
      if (!response.ok || body.startsWith("ERROR")) {
        throw new Error(`Semrush request failed for seed \"${seed}\": ${body.slice(0, 160)}`);
      }

      return parseDelimited(body).map((row) => {
        const keyword = row.Keyword || "";
        return {
          keyword,
          seed,
          source: "semrush" as const,
          volume: Number(row["Search Volume"] || 0),
          difficulty: Number(row["Keyword Difficulty Index"] || 50),
          cpc: Number(row.CPC || 0),
          intent: intentFromSemrush(row.Intents),
          trend: trendValues(row.Trends),
          ...keywordHeuristics(keyword),
        };
      });
    }),
  );

  const unique = new Map<string, RawCandidate>();
  for (const candidate of results.flat()) {
    if (candidate.keyword && !unique.has(candidate.keyword)) {
      unique.set(candidate.keyword, candidate);
    }
  }
  return [...unique.values()];
}
