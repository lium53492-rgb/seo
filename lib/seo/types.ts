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

export type FunnelStage = "problem" | "solution" | "trial" | "purchase";

export type ConversionGoal =
  | "qualified_outbound_click"
  | "trial_start"
  | "purchase";

export type CandidateDecisionEvidence = {
  schemaVersion: 1;
  evidenceRefs: string[];
  searcherJob: string;
  productFactIds: string[];
  productSignals: Array<
    "voice_roleplay" | "story_premise" | "role_selection" | "interactive_fiction"
  >;
  trialSignals: Array<
    "solution_aware" | "immediate_use" | "experience_seeking" | "action_language"
  >;
  revenueSignals: Array<
    "commercial_comparison" | "alternative_seeking" | "purchase_language" | "recurring_use"
  >;
  specificitySignals: Array<
    "defined_task" | "defined_format" | "defined_audience" | "narrow_modifier"
  >;
  ipClass: "original_generic" | "ambiguous_reference" | "third_party_ip";
  cannibalizationClass: "new_intent" | "adjacent_intent" | "same_intent";
  nearestExistingSlug: string | null;
  rationale: {
    demand: string;
    difficulty: string;
    productFit: string;
    trialIntent: string;
    revenueIntent: string;
    intentSpecificity: string;
    originality: string;
    ipRisk: string;
    cannibalizationRisk: string;
  };
};

export type KeywordCandidate = {
  keyword: string;
  seed: string;
  source: "demo" | "semrush" | "search_console" | "codex_research";
  metricBasis?: "provider_metrics" | "research_proxy";
  scoreBasis?: "evidence_signals_v1";
  demandScore?: number;
  volume: number;
  difficulty: number;
  cpc: number;
  intent: SearchIntent;
  trend: number[];
  productFit: number;
  originality: number;
  conversionIntent: number;
  trialIntent?: number;
  revenueIntent?: number;
  intentSpecificity?: number;
  funnelStage?: FunnelStage;
  conversionGoal?: ConversionGoal;
  ipRisk: number;
  cannibalizationRisk: number;
  decisionEvidence?: CandidateDecisionEvidence;
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
  schemaVersion: 1 | 2;
  status: "published";
  slug: string;
  path: string;
  keyword: string;
  publishedAt: string;
  updatedAt: string;
  generatedFromReport: string;
  draftDigest?: string;
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
    trialIntent?: number;
    revenueIntent?: number;
    intentSpecificity?: number;
    funnelStage?: FunnelStage;
    conversionGoal?: ConversionGoal;
    scoreBasis?: "evidence_signals_v1";
    evidenceRefs?: string[];
    productFactIds?: string[];
  };
  editorialReview?: EditorialReview;
};

export type ReportPublication = {
  status: "published" | "ready_for_review" | "blocked" | "not_requested";
  path?: string;
  slug?: string;
  slot?: "morning" | "afternoon";
  reason: string;
  publishedAt?: string;
  draftDigest?: string;
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
  conversionHypothesis?: string;
  primaryConversion?: ConversionGoal;
  measurementPlan?: string;
};

export type EditorialReview = {
  schemaVersion: 1;
  reportId: string;
  slug: string;
  decision: "approved";
  reviewerType: "human" | "codex_editor";
  reviewer: string;
  reviewedAt: string;
  notes: string;
  draftDigest: string;
  checks: Array<{
    id: string;
    passed: true;
    detail: string;
  }>;
};

export type ObservedMetric = {
  status: "observed" | "unavailable";
  value: number | null;
  source: "search_console" | "vercel_analytics" | "seo_redirect" | "product_analytics" | "payments";
  detail: string;
};

export type SeoGrowthFunnel = {
  schemaVersion: 1;
  attributionStatus: "unavailable" | "partial" | "connected";
  aggregationKey: "source_slug+reporting_period";
  conversionJoinKey: "seo_click_id";
  /** Legacy report compatibility. New reports use `conversionJoinKey`. */
  joinKey?: "seo_click_id";
  periodStart: string;
  periodEnd: string;
  metrics: {
    organicClicks: ObservedMetric;
    landingUv: ObservedMetric;
    qualifiedOutboundClicks: ObservedMetric;
    trialStarts: ObservedMetric;
    signups: ObservedMetric;
    paidConversions: ObservedMetric;
    revenueMinor: ObservedMetric;
  };
  currency?: string;
};

export type SearchConsolePerformanceSnapshot = {
  state: "observed" | "unavailable";
  sourceSlug: string;
  pageUrl: string;
  startDate: string;
  endDate: string;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  detail: string;
};

export type GrowthPortfolioReport = {
  sourceSlug: string;
  funnel: SeoGrowthFunnel;
  pageviews: number | null;
  outboundRequests: number | null;
  purchaseEvents: number | null;
  orphanCallbacks: number | null;
  revenueByCurrency: Record<string, number>;
  ctaLocations: Record<string, number>;
  searchPerformance?: SearchConsolePerformanceSnapshot;
};

export type GrowthPortfolioEntry =
  | {
      sourceSlug: string;
      path: string;
      keyword: string;
      state: "collected";
      report: GrowthPortfolioReport;
    }
  | {
      sourceSlug: string;
      path: string;
      keyword: string;
      state: "unavailable";
      reason: string;
    };

export type GrowthPortfolioSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  periodBasis: "complete_shanghai_calendar_days";
  reportingWindowDays?: number;
  reportingLagDays?: number;
  aggregationKey: "source_slug+reporting_period";
  conversionJoinKey: "seo_click_id";
  periodStart: string;
  periodEnd: string;
  summary: {
    publishedPages: number;
    collectedPages: number;
    unavailablePages: number;
  };
  entries: GrowthPortfolioEntry[];
};

export type GrowthPortfolioDecision = {
  schemaVersion: 1;
  action: RecommendedAction;
  targetSlug: string | null;
  rationale: string;
  evidenceSlugs: string[];
};

export type DailySeoReport = {
  id: string;
  date: string;
  policyVersion?: 3 | 4;
  publicationMode?: "create" | "update";
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
  funnel?: SeoGrowthFunnel;
  portfolioFunnels?: GrowthPortfolioSnapshot;
  portfolioDecision?: GrowthPortfolioDecision;
  integrations: IntegrationStatus[];
  evidence?: Array<{
    id?: string;
    title: string;
    url: string;
    source: string;
    collectedAt: string;
    supports: string[];
  }>;
  caveats: string[];
};
