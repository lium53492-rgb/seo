import "server-only";

import { parseDelimited } from "../csv";
import { intentFromSemrush } from "../scoring";
import type { KeywordCandidate } from "../types";

type RawCandidate = Omit<KeywordCandidate, "score" | "action" | "reason">;

type SemrushV4Response = {
  meta?: {
    success?: boolean;
    status_code?: number;
  };
  data?: {
    cpc?: string | null;
    intents?: string[] | null;
    keyword_difficulty?: number | null;
    search_volume?: string | null;
    trends?: number[] | null;
  };
};

const DEFAULT_SEEDS = ["voice roleplay", "ai roleplay game", "ai story game"];

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

async function discoverRelatedKeywords(
  seed: string,
  apiKey: string,
  database: string,
  rowLimit: number,
) {
  const params = new URLSearchParams({
    type: "phrase_related",
    key: apiKey,
    phrase: seed,
    database,
    display_limit: String(rowLimit),
    export_columns: "Ph",
  });
  const response = await fetch(`https://api.semrush.com/?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  if (!response.ok || body.startsWith("ERROR")) {
    throw new Error(
      `Semrush related-keyword discovery failed for "${seed}": ${response.status} ${body.slice(0, 120)}`,
    );
  }
  return parseDelimited(body)
    .map((row) => row.Keyword?.trim())
    .filter((keyword): keyword is string => Boolean(keyword));
}

async function fetchCurrentMetrics(
  keyword: string,
  apiKey: string,
  country: string,
) {
  const params = new URLSearchParams({ keyword, country, format: "json" });
  const response = await fetch(
    `https://api.semrush.com/apis/v4/keywords/v1/metrics?${params}`,
    {
      headers: { authorization: `Apikey ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = (await response.json().catch(() => null)) as SemrushV4Response | null;
  if (!response.ok || !body?.meta?.success || !body.data) {
    throw new Error(
      `Semrush v4 metrics failed for "${keyword}": ${response.status}`,
    );
  }
  return body.data;
}

export async function fetchSemrushCandidates(): Promise<RawCandidate[]> {
  const apiKey = process.env.SEMRUSH_API_KEY;
  if (!apiKey) return [];

  const database = (process.env.SEMRUSH_DATABASE || "us").toLowerCase();
  const country = (process.env.SEMRUSH_COUNTRY || database).toUpperCase();
  const rowLimit = Math.min(
    20,
    Math.max(3, Number(process.env.SEMRUSH_ROWS_PER_SEED || "8")),
  );
  const seeds = (process.env.SEO_KEYWORD_SEEDS || DEFAULT_SEEDS.join(","))
    .split(",")
    .map((seed) => seed.trim())
    .filter(Boolean)
    .slice(0, 5);

  const discovered = await Promise.all(
    seeds.map(async (seed) => ({
      seed,
      keywords: await discoverRelatedKeywords(seed, apiKey, database, rowLimit),
    })),
  );
  const unique = new Map<string, string>();
  for (const group of discovered) {
    for (const keyword of group.keywords) {
      if (!unique.has(keyword)) unique.set(keyword, group.seed);
    }
  }

  const metrics = await Promise.all(
    [...unique].map(async ([keyword, seed]) => ({
      keyword,
      seed,
      data: await fetchCurrentMetrics(keyword, apiKey, country),
    })),
  );

  return metrics.map(({ keyword, seed, data }) => ({
    keyword,
    seed,
    source: "semrush" as const,
    volume: Number(data.search_volume || 0),
    difficulty: Number(data.keyword_difficulty ?? 50),
    cpc: Number(data.cpc || 0) / 100,
    intent: intentFromSemrush(data.intents ?? undefined),
    trend: (data.trends ?? []).filter(Number.isFinite),
    ...keywordHeuristics(keyword),
  }));
}
