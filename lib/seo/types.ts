export type DataMode = "demo" | "live" | "partial";

export type SearchIntent =
  | "commercial"
  | "informational"
  | "navigational"
  | "transactional"
  | "mixed";

export type RecommendedAction =
  | "create_page"
  | "improve_page"
  | "consolidate"
  | "observe";

export type KeywordCandidate = {
  keyword: string;
  seed: string;
  source: "demo" | "semrush" | "search_console";
  volume: number;
  difficulty: number;
  cpc: number;
  intent: SearchIntent;
  trend: number[];
  productFit: number;
  originality: number;
  conversionIntent: number;
  ipRisk: number;
  cannibalizationRisk: number;
  existingUrl?: string;
  score: number;
  action: RecommendedAction;
  reason: string;
};

export type PagePerformance = {
  url: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  recommendedAction: string;
};

export type IntegrationStatus = {
  id: "semrush" | "search_console" | "github" | "product_analytics";
  name: string;
  state: "connected" | "demo" | "missing";
  detail: string;
};

export type PageBrief = {
  keyword: string;
  slug: string;
  pageType: "product" | "scenario" | "guide";
  searchIntent: SearchIntent;
  title: string;
  description: string;
  h1: string;
  primaryCta: string;
  sections: string[];
  evidenceRequired: string[];
  qualityGate: string[];
};

export type DailyAction = {
  priority: "P0" | "P1" | "P2";
  action: string;
  why: string;
  expectedImpact: string;
};

export type DailySeoReport = {
  id: string;
  date: string;
  generatedAt: string;
  mode: DataMode;
  headline: string;
  summary: {
    candidatesAnalyzed: number;
    publishableOpportunities: number;
    totalClicks: number;
    totalImpressions: number;
    averageCtr: number;
  };
  opportunities: KeywordCandidate[];
  performance: PagePerformance[];
  actions: DailyAction[];
  brief: PageBrief;
  integrations: IntegrationStatus[];
  caveats: string[];
};
