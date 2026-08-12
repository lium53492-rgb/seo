export type DataMode = "disconnected" | "live" | "partial";

export type WorkbenchFeedbackDecision = "adopted" | "rejected";

export type WorkbenchFeedbackEntry = {
  id: string;
  createdAt: string;
  message: string;
  source: "workbench" | "codex_chat";
  kind: "content_guidance";
  consumedAt?: string;
  decision?: WorkbenchFeedbackDecision;
  rationale?: string;
};

export type WorkbenchFeedbackQueueEntry = WorkbenchFeedbackEntry & {
  /** Exact Shanghai-date inbox file that owns this entry. */
  date: string;
};

export type WorkbenchFeedbackQueueSummary = {
  pendingCount: number;
  entries: WorkbenchFeedbackQueueEntry[];
  destination: "local" | "github";
};

export type MarkWorkbenchFeedbackConsumedInput = {
  id: string;
  date: string;
  decision: WorkbenchFeedbackDecision;
  rationale: string;
  consumedAt?: string;
};

export type ReportFeedbackDecision = {
  id: string;
  date: string;
  message: string;
  decision: WorkbenchFeedbackDecision;
  rationale: string;
};

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
    "voice_roleplay" | "story_premise" | "role_selection" | "interactive_fiction" | "dnd_content" | "adult_tabletop_audience"
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

export type GoogleTrendsSourceUrl =
  | `https://trends.google.com/${string}`
  | `https://developers.google.com/search/apis/trends${string}`
  | `https://support.google.com/trends/answer/12764470${string}`;

export type GoogleTrendsDirection = "rising" | "flat" | "falling" | "unknown";

type GoogleTrendsLegacySignalBase = {
  keyword: string;
  source: "google_trends";
  sourceUrl: GoogleTrendsSourceUrl;
  geo: string;
  period: string;
  collectedAt: string;
  detail: string;
};

export type GoogleTrendsSignal =
  | (GoogleTrendsLegacySignalBase & {
      state: "observed";
      relativeInterest: number;
      direction: GoogleTrendsDirection;
    })
  | (GoogleTrendsLegacySignalBase & {
      state: "unavailable";
      relativeInterest: null;
      direction: "unknown";
    })
  | {
      schemaVersion: 2;
      keyword: string;
      source: "google_trends";
      collectionMethod: "bigquery_public_dataset";
      sourceUrl: `https://support.google.com/trends/answer/12764470${string}`;
      sourceTable: "bigquery-public-data.google_trends.top_rising_terms";
      state: "observed" | "not_observed" | "unavailable";
      relativeInterest: null;
      direction: "rising" | "unknown";
      geo: "US";
      period: string;
      collectedAt: string;
      detail: string;
      refreshDate: string | null;
      week: string | null;
      bestRank: number | null;
      maxPercentGain: number | null;
      dmaCount: number | null;
      snapshotDigest: string;
    };

export type GoogleTrendsBigQueryTerm = {
  term: string;
  normalizedTerm: string;
  week: string;
  bestRank: number;
  dmaCount: number;
  sourceTable:
    | "bigquery-public-data.google_trends.top_terms"
    | "bigquery-public-data.google_trends.top_rising_terms";
  maxDmaScore?: number;
  maxPercentGain?: number | null;
};

export type GoogleTrendsBigQueryCollection = {
  schemaVersion: 2;
  provider: "google_trends_bigquery_public_dataset";
  state: "observed" | "unavailable";
  collectedAt: string;
  sourceUrl: `https://support.google.com/trends/answer/12764470${string}`;
  geo: "US";
  coverage: {
    label: "Top 25 and Top 25 Rising Google Trends terms by US DMA";
    topTermsPerDma: 25;
    topRisingTermsPerDma: 25;
    arbitraryQueryCoverage: false;
    absenceMeansZero: false;
  };
  query: {
    location: "US";
    useLegacySql: false;
    maximumBytesBilled: string;
    timeoutMs: number;
    asOfDate: string;
    refreshDateRule: "as_of_date_minus_1_day";
    topTermsSqlDigest: string;
    topRisingTermsSqlDigest: string;
  };
  refreshDate: string | null;
  week: string | null;
  results: {
    topTerms: { rowCount: number; resultDigest: string };
    topRisingTerms: { rowCount: number; resultDigest: string };
  };
  exactCandidateMatches: Array<{
    keyword: string;
    normalizedKeyword: string;
    topTerm: GoogleTrendsBigQueryTerm | null;
    risingTerm: GoogleTrendsBigQueryTerm | null;
  }>;
  discoveryLeads: Array<{
    term: string;
    normalizedTerm: string;
    listType: "top" | "rising";
    week: string;
    bestRank: number;
    dmaCount: number;
    maxDmaScore: number | null;
    maxPercentGain: number | null;
    sourceTable:
      | "bigquery-public-data.google_trends.top_terms"
      | "bigquery-public-data.google_trends.top_rising_terms";
    googleTrendsGateEligibleOnExactCandidateMatch: boolean;
  }>;
  detail: string;
  snapshotDigest: string;
  attestation: {
    algorithm: "RSA-SHA256";
    clientEmail: string;
    keyFingerprint: string;
    signature: string;
  } | null;
};

export type IntegrationStatus = {
  id:
    | "semrush"
    | "codex_research"
    | "google_trends"
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

export type ContentArchetype =
  | "procedure"
  | "comparison"
  | "diagnostic"
  | "worked_examples"
  | "reference"
  | "argument";

export type ContentOpeningMove =
  | "direct_answer"
  | "before_after_contrast"
  | "diagnostic_question"
  | "worked_example"
  | "counterintuitive_claim"
  | "scenario_in_progress";

export type ContentSectionRole =
  | "direct_answer"
  | "failure_analysis"
  | "framework"
  | "worked_example"
  | "comparison"
  | "exercise"
  | "decision_rule"
  | "evidence"
  | "next_step";

export type ContentSectionFormat =
  | "prose"
  | "steps"
  | "examples"
  | "comparison"
  | "checklist"
  | "callout";

export type ContentFaqJob =
  | "definition"
  | "setup"
  | "decision"
  | "constraint"
  | "troubleshooting";

export type SignatureModuleType =
  | "worked_example"
  | "comparison"
  | "checklist"
  | "diagnostic"
  | "scenario"
  | "inventory"
  | "timeline"
  | "myth_fact";

export type PageSurfaceCopy = {
  eyebrow: string;
  shortAnswerLabel: string;
  contentsLabel: string;
  sectionLabel: string;
  faqEyebrow: string;
  faqHeading: string;
  relatedHeading: string;
  finalCtaEyebrow: string;
  finalCtaHeading: string;
  finalCtaBody: string;
  backToTop: string;
};

export type PageArchitecture = {
  schemaVersion: 1;
  intent: {
    searcherJob: string;
    painPointId:
      | "blank_start"
      | "choice_uncertainty"
      | "context_gap"
      | "stalled_exchange"
      | "format_confusion"
      | "discovery_need"
      | "quality_repair"
      | "product_fit_uncertainty"
      | "campaign_prep_overload"
      | "improv_pressure"
      | "session_stall"
      | "encounter_flatness"
      | "npc_sameness"
      | "player_agency_gap"
      | "character_hook_gap"
      | "party_tone_mismatch"
      | "worldbuilding_sprawl";
    decisionToEnable: string;
    oneSentenceAnswer: string;
    nonGoals: string[];
  };
  content: {
    archetype: ContentArchetype;
    thesis: string;
    originalContribution: string;
    tone: string;
    openingMove: ContentOpeningMove;
    avoidPhrases: string[];
    sections: Array<{
      id: string;
      role: ContentSectionRole;
      format: ContentSectionFormat;
      readerQuestion: string;
      uniqueTakeaway: string;
    }>;
    faqs: Array<{
      id: string;
      job: ContentFaqJob;
      readerObstacle: string;
      answerBoundary: string;
    }>;
    signature: {
      id: string;
      type: SignatureModuleType;
      readerAction: string;
      afterSectionId: string;
    };
  };
  differentiation: {
    against: Array<{
      slug: string;
      intentDelta: string;
      answerDelta: string;
      structureDelta: string;
      faqDelta: string;
      visualDelta: string;
    }>;
  };
  presentation: {
    recipeId: string;
    rendererId:
      | "rehearsal_slate"
      | "nocturne_decision_grid"
      | "product_field_manual"
      | "editorial_argument"
      | "specimen_catalog"
      | "orbital_mission_log"
      | "playful_story_workshop";
    visualSystemId: string;
    layoutId: string;
    paletteId: string;
    typographyId: string;
    motifId: string;
    companion: "none" | "story_companion";
    gallery: "none";
    surfaceCopy: PageSurfaceCopy;
  };
};

export type SignatureModule = {
  id: string;
  type: SignatureModuleType;
  title: string;
  intro: string;
  items: Array<{
    label: string;
    title: string;
    bodyMarkdown: string;
  }>;
};

export type OriginalIpBoundary = {
  schemaVersion: 1;
  contentBasis: "original_tabletop_fantasy";
  dndReferenceScope: "audience_reference_only";
  srdMaterialUsed: false;
  thirdPartyNames: [];
};

export type NoveltyAudit = {
  schemaVersion: 1;
  passed: boolean;
  corpusDigest: string;
  nearest: Array<{
    slug: string;
    wholeTextCosine: number;
    heroCosine: number;
    maxSectionPairCosine: number;
    maxFaqPairCosine: number;
    matchedFaqPairs: number;
    fiveWordShingleContainment: number;
    repeatedSentenceCount: number;
    repeatedSentences: string[];
  }>;
  internal: {
    maxSectionPairCosine: number;
    maxFaqPairCosine: number;
    repeatedSentenceCount: number;
  };
  violations: Array<{
    code: string;
    detail: string;
    slug?: string;
    value?: number;
    threshold?: number;
  }>;
};

export type GeneratedPageDraft = {
  /** Schema 2 binds content architecture and presentation to editorial review. */
  schemaVersion?: 1 | 2;
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
    id?: string;
    role?: ContentSectionRole;
    format?: ContentSectionFormat;
    heading: string;
    bodyMarkdown: string;
  }>;
  faqs: Array<{
    id?: string;
    job?: ContentFaqJob;
    question: string;
    answerMarkdown: string;
  }>;
  architecture?: PageArchitecture;
  signatureModule?: SignatureModule;
  ipBoundary?: OriginalIpBoundary;
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
    novelty?: NoveltyAudit;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type PublishedSeoPage = {
  schemaVersion: 1 | 2 | 3;
  status: "published";
  slug: string;
  path: string;
  keyword: string;
  publishedAt: string;
  updatedAt: string;
  generatedFromReport: string;
  draftDigest?: string;
  servedContentDigest?: string;
  pagePattern?: ContentStrategy["pagePattern"];
  architecture?: PageArchitecture;
  signatureModule?: SignatureModule;
  ipBoundary?: OriginalIpBoundary;
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
  /** Schema 2 separates reader intent, content architecture, and presentation. */
  schemaVersion: 2;
  searcherJob: string;
  painPointId: PageArchitecture["intent"]["painPointId"];
  readerStateBefore: string;
  readerOutcome: string;
  primaryPainPoint: string;
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
  visualAudit?: {
    schemaVersion: 1;
    draftDigest: string;
    inspectedAt: string;
    previewPath: string;
    passed: true;
    viewports: Array<{
      id: "desktop" | "mobile";
      width: number;
      height: number;
      screenshotPath: string;
      screenshotSha256: string;
      h1Lines: number;
      h1ViewportRatio: number;
      ctaInFirstViewport: true;
      horizontalOverflowPx: number;
      rawMarkdownVisible: false;
      signatureVisible: true;
      maxUniformNumberedRun: number;
    }>;
  };
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

export type SearchConsoleUrlInspectionSnapshot = {
  state: "observed" | "unavailable";
  sourceSlug: string;
  pageUrl: string;
  inspectedAt: string;
  verdict: "VERDICT_UNSPECIFIED" | "PASS" | "PARTIAL" | "FAIL" | "NEUTRAL" | null;
  coverageState: string | null;
  robotsTxtState:
    | "ROBOTS_TXT_STATE_UNSPECIFIED"
    | "ALLOWED"
    | "DISALLOWED"
    | null;
  indexingState:
    | "INDEXING_STATE_UNSPECIFIED"
    | "INDEXING_ALLOWED"
    | "BLOCKED_BY_META_TAG"
    | "BLOCKED_BY_HTTP_HEADER"
    | "BLOCKED_BY_ROBOTS_TXT"
    | null;
  pageFetchState:
    | "PAGE_FETCH_STATE_UNSPECIFIED"
    | "SUCCESSFUL"
    | "SOFT_404"
    | "BLOCKED_ROBOTS_TXT"
    | "NOT_FOUND"
    | "ACCESS_DENIED"
    | "SERVER_ERROR"
    | "REDIRECT_ERROR"
    | "ACCESS_FORBIDDEN"
    | "BLOCKED_4XX"
    | "INTERNAL_CRAWL_ERROR"
    | "INVALID_URL"
    | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  crawledAs: "CRAWLING_USER_AGENT_UNSPECIFIED" | "DESKTOP" | "MOBILE" | null;
  sitemap: string[];
  detail: string;
};

export type PublicGrowthMetric = {
  status: "observed" | "unavailable";
  value: number | null;
  source: "vercel_analytics" | "seo_redirect";
  detail: string;
};

export type GrowthPortfolioReport = {
  sourceSlug: string;
  metrics: {
    landingUv: PublicGrowthMetric;
    qualifiedOutboundClicks: PublicGrowthMetric;
  };
  searchPerformance: SearchConsolePerformanceSnapshot;
  urlInspection: SearchConsoleUrlInspectionSnapshot;
  decisionState: {
    landingUvReady: boolean;
    qualifiedOutboundReady: boolean;
    searchPerformanceReady: boolean;
    urlInspectionReady: boolean;
    attributionJoinChecked: boolean;
    attributionJoinBlocked: boolean;
    samePageSearchValidated: boolean;
  };
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

export type RetiredUrlGrowthEntry =
  | {
      sourceSlug: string;
      path: string;
      retiredAt?: string;
      state: "collected";
      searchPerformance: SearchConsolePerformanceSnapshot;
      urlInspection: SearchConsoleUrlInspectionSnapshot;
    }
  | {
      sourceSlug: string;
      path: string;
      retiredAt?: string;
      state: "unavailable";
      reason: string;
    };

export type GrowthPortfolioSnapshot = {
  schemaVersion: 2;
  privacyClass: "public_growth_evidence";
  generatedAt: string;
  periodBasis: "complete_shanghai_calendar_days";
  reportingWindowDays?: number;
  reportingLagDays?: number;
  aggregationKey: "source_slug+reporting_period";
  periodStart: string;
  periodEnd: string;
  summary: {
    publishedPages: number;
    collectedPages: number;
    unavailablePages: number;
    attributionJoinReady: boolean;
    attributionJoinBlocked: boolean;
    hasSearchValidatedLandingPage: boolean;
  };
  entries: GrowthPortfolioEntry[];
  retiredUrls?: RetiredUrlGrowthEntry[];
};

export type GrowthPortfolioDecision = {
  schemaVersion: 1;
  action: RecommendedAction;
  targetSlug: string | null;
  sourceSlug?: string;
  overlapQueries?: string[];
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
  /** Official Google Trends observations. Relative interest is not search volume. */
  trendSignals?: GoogleTrendsSignal[];
  /** Auditable Google Trends BigQuery collection bound to version 2 signals. */
  trendCollection?: GoogleTrendsBigQueryCollection;
  /** Verbatim disposition of every locally unconsumed workbench input at build time. */
  feedbackDecisions?: ReportFeedbackDecision[];
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
