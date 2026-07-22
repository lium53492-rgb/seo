export type DataMode = "disconnected" | "live" | "partial";

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
  source: "demo" | "semrush" | "search_console" | "codex_research";
  metricBasis?: "provider_metrics" | "research_proxy";
  demandScore?: number;
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
  id:
    | "semrush"
    | "codex_research"
    | "search_console"
    | "ai_gateway"
    | "github"
    | "product_analytics";
  name: string;
  state: "connected" | "configured" | "replaced" | "missing" | "error";
  detail: string;
  lastCheckedAt?: string;
  href?: string;
  actionLabel?: string;
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

export type ProductFact = {
  id: string;
  statement: string;
  source: string;
};

export type DraftQualityCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type GeneratedPageDraft = {
  keyword: string;
  slug: string;
  language: "en";
  model: string;
  generatedAt: string;
  status: "ready_for_review" | "blocked";
  reviewRequired: true;
  title: string;
  metaDescription: string;
  h1: string;
  heroMarkdown: string;
  primaryCta: string;
  sections: Array<{
    heading: string;
    bodyMarkdown: string;
  }>;
  faqs: Array<{
    question: string;
    answerMarkdown: string;
  }>;
  factIdsUsed: string[];
  internalLinks: Array<{
    anchor: string;
    href: string;
  }>;
  assetBriefs: string[];
  quality: {
    passed: boolean;
    wordCount: number;
    checks: DraftQualityCheck[];
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type PublishedSeoPage = {
  schemaVersion: 1;
  status: "published";
  slug: string;
  path: string;
  keyword: string;
  publishedAt: string;
  updatedAt: string;
  generatedFromReport: string;
  pagePattern?: ContentStrategy["pagePattern"];
  title: string;
  metaDescription: string;
  h1: string;
  heroMarkdown: string;
  primaryCta: string;
  sections: GeneratedPageDraft["sections"];
  faqs: GeneratedPageDraft["faqs"];
  factIdsUsed: string[];
  internalLinks: GeneratedPageDraft["internalLinks"];
  assetBriefs: string[];
  quality: GeneratedPageDraft["quality"];
  research: {
    opportunityScore: number;
    demandProxy: number;
    competitionProxy: number;
    evidenceCount: number;
  };
};

export type ReportPublication = {
  status: "published" | "blocked" | "not_requested";
  path?: string;
  slug?: string;
  slot?: "morning" | "afternoon";
  reason: string;
  publishedAt?: string;
};

export type ContentStrategy = {
  searcherJob: string;
  oneSentenceAnswer: string;
  originalContribution: string;
  pagePattern:
    | "task_guide"
    | "experience_explainer"
    | "decision_page"
    | "original_inventory"
    | "narrative_essay";
  productBridge: string;
  contextualNextStep: string;
  evidenceBoundary: string;
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
  brief: PageBrief | null;
  draft: GeneratedPageDraft | null;
  /** The morning draft is retained in `draft` for backwards compatibility. */
  drafts?: GeneratedPageDraft[];
  publication?: ReportPublication;
  /** Retained as an array for backwards compatibility with earlier reports. */
  publications?: ReportPublication[];
  contentStrategy?: ContentStrategy | null;
  integrations: IntegrationStatus[];
  evidence?: Array<{
    title: string;
    url: string;
    source: string;
    collectedAt: string;
    supports: string[];
  }>;
  caveats: string[];
};
