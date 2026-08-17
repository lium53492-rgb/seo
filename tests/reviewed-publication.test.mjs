import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { registerHooks } from "node:module";
import test from "node:test";

import { isReportDraft } from "../lib/seo/report-draft-validation.mjs";
import { listMarkdownRenderBlocks, parseMarkdownBlocks } from "../lib/seo/markdown-semantics.mjs";
import {
  GOOGLE_TRENDS_BIGQUERY_SOURCE_URL,
  GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
  GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
  GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST,
  attestGoogleTrendsCollection,
  computeGoogleTrendsCollectionDigest,
  computeGoogleTrendsResultDigest,
  normalizeGoogleTrendsTerm,
} from "../lib/seo/google-trends-contract.mjs";
import { acquireDailyLease, coordinationOwner } from "../scripts/lib/daily-coordination.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const trendsTestClientEmail =
  "trends-reader@seo-trends-fixture.iam.gserviceaccount.com";
const { privateKey: trendsTestPrivateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
delete process.env.GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL;
delete process.env.GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY;
const builderPath = join(repoRoot, "scripts", "build-free-research-report.mjs");
const publisherPath = join(repoRoot, "scripts", "publish-reviewed-page.mjs");
const emptyServerOnlyModule = "data:text/javascript,export {}";

function spawnSync(command, args, options = {}) {
  const env = {
    ...process.env,
    ...(options.env ?? {}),
  };
  delete env.__NEXT_PROCESSED_ENV;
  return nodeSpawnSync(command, args, {
    ...options,
    env,
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: emptyServerOnlyModule, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const aliasedPath = specifier.slice(2);
      const path = join(repoRoot, aliasedPath.endsWith(".json") ? aliasedPath : `${aliasedPath}.ts`);
      return {
        url: pathToFileURL(path).href,
        ...(aliasedPath.endsWith(".json") ? { importAttributes: { type: "json" } } : {}),
        shortCircuit: true,
      };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const candidate = fileURLToPath(new URL(`${specifier}.ts`, context.parentURL));
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const unavailable = (source, detail) => ({ status: "unavailable", value: null, source, detail });

function nestedKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const item of value) nestedKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    nestedKeys(child, keys);
  }
  return keys;
}

function bindBigQueryTrendEvidence(input, { selectedObserved = true } = {}) {
  const selectedKeyword = input.candidates[0].keyword;
  const normalizedSelectedKeyword = normalizeGoogleTrendsTerm(selectedKeyword);
  const risingTerm = {
    term: selectedKeyword,
    normalizedTerm: normalizedSelectedKeyword,
    week: "2098-12-28",
    bestRank: 4,
    maxPercentGain: 320,
    dmaCount: 12,
    sourceTable: GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
  };
  const unrelatedRisingTerm = {
    ...risingTerm,
    term: "unrelated rising fixture",
    normalizedTerm: "unrelated rising fixture",
  };
  const persistedResultRow = selectedObserved ? risingTerm : unrelatedRisingTerm;
  let trendCollection = {
    schemaVersion: 2,
    provider: "google_trends_bigquery_public_dataset",
    state: "observed",
    collectedAt: "2099-01-01T09:05:00+08:00",
    sourceUrl: GOOGLE_TRENDS_BIGQUERY_SOURCE_URL,
    geo: "US",
    coverage: {
      label: "Top 25 and Top 25 Rising Google Trends terms by US DMA",
      topTermsPerDma: 25,
      topRisingTermsPerDma: 25,
      arbitraryQueryCoverage: false,
      absenceMeansZero: false,
    },
    query: {
      location: "US",
      useLegacySql: false,
      maximumBytesBilled: "104857600",
      timeoutMs: 15000,
      asOfDate: input.date,
      refreshDateRule: "as_of_date_minus_1_day",
      topTermsSqlDigest: GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST,
      topRisingTermsSqlDigest: GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
    },
    refreshDate: "2098-12-31",
    week: "2098-12-28",
    results: {
      topTerms: {
        rowCount: 1,
        resultDigest: computeGoogleTrendsResultDigest([persistedResultRow]),
      },
      topRisingTerms: {
        rowCount: 1,
        resultDigest: computeGoogleTrendsResultDigest([persistedResultRow]),
      },
    },
    exactCandidateMatches: input.candidates.map((candidate, index) => ({
      keyword: candidate.keyword,
      normalizedKeyword: normalizeGoogleTrendsTerm(candidate.keyword),
      topTerm: null,
      risingTerm: selectedObserved && index === 0 ? risingTerm : null,
    })),
    discoveryLeads: [],
    detail: "Official US DMA Top 25 and Top 25 Rising test collection completed.",
    snapshotDigest: "",
    attestation: null,
  };
  trendCollection = attestGoogleTrendsCollection(trendCollection, {
    privateKey: trendsTestPrivateKey,
    clientEmail: trendsTestClientEmail,
  });
  const trendSignals = trendCollection.exactCandidateMatches.map((match, index) => ({
    schemaVersion: 2,
    keyword: match.keyword,
    source: "google_trends",
    collectionMethod: "bigquery_public_dataset",
    sourceUrl: GOOGLE_TRENDS_BIGQUERY_SOURCE_URL,
    sourceTable: GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
    state: selectedObserved && index === 0 ? "observed" : "not_observed",
    relativeInterest: null,
    direction: selectedObserved && index === 0 ? "rising" : "unknown",
    geo: "US",
    period: "week starting 2098-12-28",
    collectedAt: trendCollection.collectedAt,
    detail: selectedObserved && index === 0
      ? "Exact candidate appeared in the official US top-rising feed; no nationwide score was inferred."
      : "The exact candidate did not appear in the successful US top-rising collection; this is not zero demand.",
    refreshDate: trendCollection.refreshDate,
    week: trendCollection.week,
    bestRank: selectedObserved && index === 0 ? risingTerm.bestRank : null,
    maxPercentGain: selectedObserved && index === 0 ? risingTerm.maxPercentGain : null,
    dmaCount: selectedObserved && index === 0 ? risingTerm.dmaCount : null,
    snapshotDigest: trendCollection.snapshotDigest,
  }));
  input.trendCollection = trendCollection;
  input.trendSignals = trendSignals;
}

test("report generation cannot publish before a separate approval artifact", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "seo-workflow-"));
  try {
    const trendsEnvFixture = [
      `GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL=${trendsTestClientEmail}`,
      `GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY=${trendsTestPrivateKey.trim().replace(/\n/g, "\\n")}`,
      "",
    ].join("\n");
    await writeFile(join(workspace, ".env.local"), trendsEnvFixture);
    await writeFile(join(workspace, ".env.test.local"), trendsEnvFixture);
    await mkdir(join(workspace, "data", "config"), { recursive: true });
    await cp(join(repoRoot, "data", "config"), join(workspace, "data", "config"), { recursive: true });
    await mkdir(join(workspace, "data", "research"), { recursive: true });
    const pagesDirectory = join(workspace, "data", "pages");
    await mkdir(pagesDirectory, { recursive: true });
    const existingPage = JSON.parse(await readFile(
      join(repoRoot, "data", "pages", "ai-roleplay-prompt-vs-existing-story.json"),
      "utf8",
    ));
    Object.assign(existingPage, {
      slug: "unrelated-campaign-archive",
      path: "/unrelated-campaign-archive",
      keyword: "tabletop campaign archive workflow",
      title: "Tabletop Campaign Archive Workflow",
      h1: "Tabletop Campaign Archive Workflow",
      metaDescription: "Organize a mature tabletop campaign archive around unresolved threads, faction state, and the next preparation decision.",
      heroMarkdown: "This unrelated fixture represents a campaign-record workflow rather than the prompt-versus-story decision tested by the candidate batch.",
    });
    await writeFile(
      join(pagesDirectory, `${existingPage.slug}.json`),
      `${JSON.stringify(existingPage, null, 2)}\n`,
    );

    const keywords = [
      "play an ai roleplay story",
      "d&d player character first reply",
      "d&d session stall recovery",
      "d&d player character voice consistency",
      "d&d session reply pacing",
      "d&d encounter dialogue vs action",
      "d&d player character motivation hook",
      "d&d campaign choice consequences",
    ];
    const searcherJobs = [
      "Use an AI game master and persistent campaign state to reduce repeat D&D preparation, then choose one original scene action to carry into the next session.",
      "Write one D&D player character reply from a supplied session detail, a small in-character action, and a hook the next turn can answer.",
      "Recover a stalled D&D session by adding one grounded observation, action, or decision that creates a clear next beat at the table.",
      "Maintain a D&D player character perspective during a campaign session after the opening exchange has already begun.",
      "Set the pacing of a D&D session reply so it matches how actively the player character should respond at the table.",
      "Decide whether a D&D encounter response should use dialogue, an action, or both for the current campaign beat.",
      "Find one immediate D&D player character motivation hook so the next session decision has a coherent direction.",
      "Choose a D&D campaign action with a visible consequence for the current session instead of adding a disconnected line.",
    ];
    const decisionRationale = Object.fromEntries([
      "demand",
      "difficulty",
      "productFit",
      "trialIntent",
      "revenueIntent",
      "intentSpecificity",
      "originality",
      "ipRisk",
      "cannibalizationRisk",
    ].map((field) => [
      field,
      `The ${field} judgment is grounded in the cited public evidence and the explicit searcher job.`,
    ]));
    const candidates = keywords.map((keyword, index) => ({
      keyword,
      seed: "ai roleplay story",
      demandScore: 78 - index,
      difficulty: 28 + index,
      intent: "transactional",
      funnelStage: "trial",
      conversionGoal: "trial_start",
      productFit: 94 - index,
      originality: 88 - index,
      conversionIntent: 91 - index,
      trialIntent: 92 - index,
      revenueIntent: 76 - index,
      intentSpecificity: 93 - index,
      ipRisk: 0,
      cannibalizationRisk: 5 + index,
      decisionEvidence: {
        schemaVersion: 1,
        evidenceRefs: ["evidence-1", "evidence-2"],
        searcherJob: searcherJobs[index],
        productFactIds: [
          "dnd-content-direction",
          "dnd-primary-audience",
          "playworlds-current-product",
          "playworlds-voice-text-single-player-rpg",
          "playworlds-ai-game-master",
          "playworlds-persistent-campaigns",
          "playworlds-rpg-state",
        ],
        productSignals: [
          "dnd_content",
          "adult_tabletop_audience",
          "playworlds_current_product",
          "playworlds_voice_text_rpg",
          "playworlds_ai_game_master",
          "playworlds_persistent_campaigns",
          "playworlds_rpg_state",
        ],
        trialSignals: [
          "solution_aware",
          "immediate_use",
          "experience_seeking",
          "action_language",
        ],
        revenueSignals: [
          "commercial_comparison",
          "alternative_seeking",
          "recurring_use",
        ],
        specificitySignals: [
          "defined_task",
          "defined_format",
          "defined_audience",
          "narrow_modifier",
        ],
        ipClass: "original_generic",
        cannibalizationClass: "new_intent",
        nearestExistingSlug: null,
        rationale: decisionRationale,
      },
    }));
    const supports = [...keywords];
    const sectionBodies = [
      "A useful D&D campaign entry decision separates two jobs. A fresh route asks the player to establish an original premise. A persistent route resumes saved campaign context. This prevents a generic opening from standing in for a table-ready choice. It stays inside approved facts: Playworlds is described as a single-player voice-or-text AI adventure RPG with an AI game master and persistent campaigns. The guide does not promise a named setting, price, release state, response speed, or technical voice behavior.",
      "Find wasted campaign preparation with a compact evidence grid instead of a feature checklist.\n1. In the first column, write what premise, opposition, and stakes the Game Master must invent.\n2. In the second column, write which of those elements the prepared situation already supplies.\nThen mark where player-character perspective comes from and what decision could reach the table this session. If neither route produces a consequential choice, the preparation is still scenery rather than playable pressure. The exercise does not crown a universal winner. It helps a trial-ready tabletop reader identify which starting condition matches tonight's job, while keeping every example original and clear of protected settings, monsters, or characters.",
      "Use a three-question campaign rule after diagnosing the waste.\n- First, do you want to establish a fresh campaign or resume a pressure already recorded in a persistent one?\n- Second, can the next attempted action give the AI game master enough information to describe an outcome and present a meaningful choice?\n- Third, can you name a consequence that should be visible in the tracked campaign state before the session ends?\nThree clear answers produce a bounded preparation plan; uncertainty on any answer identifies the exact gap to solve. This framework is narrower than a beginner tutorial. It gives an adult player or Game Master enough structure to protect agency, preserve campaign tone, and stop before unused lore crowds out the next table decision.",
      "Consider an original campaign in which a storm-battered river town has one working signal bell. The ferrymaster wants it rung to guide refugees, while the night watch warns that the sound will reveal the crossing to raiders. A prepared route already supplies pressure, two credible interests, and a consequence; the Game Master only needs to frame what the party knows. A blank route is the better choice when the group wants to invent the town, threat, and obligations together. In either case, ask the player characters what risk they accept and let that answer change the next scene. The example proves the framework at table scale without borrowing a licensed world or dictating a correct outcome.",
      "Carry one qualified campaign choice forward after the example passes the table test. Open the attributed Playworlds Steam destination, inspect the official description of voice-or-text play, the AI game master, and persistent campaigns, then decide whether they fit the preparation job. The guide neither starts a session nor guarantees a scenario or outcome. It replaces a vague visit with a measurable one: the reader knows which state matters and which action to attempt. The redirect records only the product-scoped outbound step; downstream conversion remains unavailable until a verified Playworlds callback exists.",
    ];
    const input = {
      policyVersion: 4,
      date: "2099-01-01",
      generatedAt: "2099-01-01T09:15:00+08:00",
      contentStrategy: {
        schemaVersion: 2,
        searcherJob: candidates[0].decisionEvidence.searcherJob,
        painPointId: "campaign_prep_overload",
        readerStateBefore: "The reader wants to reduce repeat D&D preparation but has not decided whether to start fresh or resume persistent campaign state.",
        readerOutcome: "The reader can choose a campaign route deliberately and explain one scene-level action for the AI game master to resolve.",
        primaryPainPoint: "The reader is close to evaluating Playworlds but cannot tell which campaign route removes the right kind of setup work.",
        oneSentenceAnswer: "Use the Playworlds AI game master and persistent campaign state to turn one bounded prep decision into a voice-or-text adventure attempt.",
        originalContribution: "A decision sequence that maps campaign-prep intent to persistent state, one attempted action, and a measured next step.",
        pagePattern: "decision_page",
        productBridge: "The approved Playworlds facts describe a single-player voice-or-text AI adventure RPG with an AI game master, persistent campaigns, and tracked RPG state.",
        contextualNextStep: "Send a qualified reader through the attributed Playworlds Steam route after the campaign-prep decision barrier is resolved.",
        evidenceBoundary: "Use only the approved product fact catalog and public evidence for the searcher job.",
        conversionHypothesis: "Readers evaluating an AI game master should produce more qualified Playworlds outbound visits after seeing the exact campaign-prep sequence.",
        primaryConversion: "qualified_outbound_click",
        measurementPlan: "Measure the product-scoped Playworlds qualified outbound by seo_click_id and keep downstream conversion unavailable until a verified callback exists.",
      },
      candidates,
      trendSignals: [
        {
          keyword: keywords[0],
          source: "google_trends",
          sourceUrl: "https://trends.google.com/trends/explore?date=today%2012-m&geo=US&q=ai%20roleplay%20story",
          state: "observed",
          relativeInterest: 67,
          direction: "rising",
          geo: "US",
          period: "past 12 months",
          collectedAt: "2099-01-01T09:05:00+08:00",
          detail: "Test fixture for a visible official Google Trends relative-interest observation.",
        },
        {
          keyword: keywords[1],
          source: "google_trends",
          sourceUrl: "https://developers.google.com/search/apis/trends",
          state: "unavailable",
          relativeInterest: null,
          direction: "unknown",
          geo: "Worldwide",
          period: "past 12 months",
          collectedAt: "2099-01-01T09:05:00+08:00",
          detail: "Test fixture records that an official Google Trends observation was unavailable.",
        },
      ],
      evidence: Array.from({ length: 5 }, (_, index) => ({
        id: `evidence-${index + 1}`,
        title: `Independent evidence ${index + 1}`,
        url: `https://source${index + 1}.example/evidence`,
        source: `Source ${index + 1}`,
        collectedAt: "2099-01-01T09:00:00+08:00",
        supports,
        ...(index === 2
          ? {
              kind: "breakout_page",
              signal: {
                type: "search_prominence",
                value: 3,
                unit: "organic_result_position",
                basis: "Observed in the same-day public search-result sample for the selected query.",
                detail: "The independent page appeared among the first three organic results for the selected keyword during collection.",
              },
            }
          : {}),
      })),
      performance: [],
      portfolioDecision: {
        schemaVersion: 1,
        action: "create_page",
        targetSlug: null,
        rationale: "The unrelated archive page has a complete observed readiness snapshot, so the explicit decision is to create a distinct campaign-prep page.",
        evidenceSlugs: [existingPage.slug],
      },
      funnel: {
        schemaVersion: 1,
        aggregationKey: "source_slug+reporting_period",
        conversionJoinKey: "seo_click_id",
        periodStart: "2098-12-05T00:00:00+08:00",
        periodEnd: "2099-01-01T09:00:00+08:00",
        metrics: {
          organicClicks: unavailable("search_console", "No visible Search Console rows in the reporting window."),
          landingUv: unavailable("vercel_analytics", "No Vercel Analytics export was available for this fixture."),
          qualifiedOutboundClicks: unavailable("seo_redirect", "No redirect aggregation was available for this fixture."),
          trialStarts: unavailable("product_analytics", "A verified Playworlds trial callback is not implemented in this fixture."),
          signups: unavailable("product_analytics", "A verified Playworlds signup callback is not implemented in this fixture."),
          paidConversions: unavailable("payments", "Payment callbacks are not connected in this fixture."),
          revenueMinor: unavailable("payments", "Attributed revenue is not connected in this fixture."),
        },
      },
      portfolioFunnels: {
        schemaVersion: 2,
        privacyClass: "public_growth_evidence",
        generatedAt: "2099-01-01T09:00:00+08:00",
        periodBasis: "complete_shanghai_calendar_days",
        reportingWindowDays: 28,
        reportingLagDays: 3,
        aggregationKey: "source_slug+reporting_period",
        periodStart: "2098-12-05T00:00:00+08:00",
        periodEnd: "2099-01-01T00:00:00+08:00",
        summary: {
          publishedPages: 1,
          collectedPages: 1,
          unavailablePages: 0,
          attributionJoinReady: true,
          attributionJoinBlocked: false,
          hasSearchValidatedLandingPage: false,
        },
        globalAttribution: {
          schemaVersion: 1,
          product: "playworlds",
          state: "observed",
          attributionJoinReady: true,
          detail: "The independent Playworlds callback and attribution store fixture probe passed.",
        },
        entries: [{
          sourceSlug: existingPage.slug,
          path: existingPage.path,
          keyword: existingPage.keyword,
          state: "collected",
          report: {
            sourceSlug: existingPage.slug,
            metrics: {
              landingUv: { status: "observed", value: 0, source: "vercel_analytics", detail: "Observed exact-page landing UV aggregate for the fixture period." },
              qualifiedOutboundClicks: { status: "observed", value: 0, source: "seo_redirect", detail: "Observed exact-page qualified outbound aggregate for the fixture period." },
            },
            searchPerformance: {
              state: "observed",
              sourceSlug: existingPage.slug,
              pageUrl: `https://lorelens.playworlds.ai/${existingPage.slug}`,
              startDate: "2098-12-05",
              endDate: "2098-12-31",
              clicks: 0,
              impressions: 0,
              ctr: 0,
              position: null,
              detail: "Observed an exact-page Search Console aggregate with zero rows in this fixture period.",
            },
            urlInspection: {
              state: "observed",
              sourceSlug: existingPage.slug,
              pageUrl: `https://lorelens.playworlds.ai/${existingPage.slug}`,
              inspectedAt: "2099-01-01T08:55:00+08:00",
              verdict: "PASS",
              coverageState: "Submitted and indexed",
              robotsTxtState: "ALLOWED",
              indexingState: "INDEXING_ALLOWED",
              pageFetchState: "SUCCESSFUL",
              lastCrawlTime: "2098-12-31T08:00:00+08:00",
              googleCanonical: `https://lorelens.playworlds.ai/${existingPage.slug}`,
              userCanonical: `https://lorelens.playworlds.ai/${existingPage.slug}`,
              crawledAs: "MOBILE",
              sitemap: ["https://lorelens.playworlds.ai/sitemap.xml"],
              detail: "Observed the exact-page URL Inspection result for the active fixture page.",
            },
            decisionState: {
              landingUvReady: true,
              qualifiedOutboundReady: true,
              searchPerformanceReady: true,
              urlInspectionReady: true,
              attributionJoinChecked: true,
              attributionJoinBlocked: false,
              samePageSearchValidated: false,
            },
          },
        }],
      },
      draft: {
        schemaVersion: 2,
        keyword: keywords[0],
        slug: "/play-an-ai-roleplay-story",
        model: "codex-test",
        generatedAt: "2099-01-01T09:15:00+08:00",
        language: "en",
        reviewRequired: true,
        title: "Choose a D&D AI Game Master Route Without Wasted Prep",
        metaDescription: "Compare a fresh start with persistent campaign state, then choose one original action for an AI game master to resolve without wasted D&D preparation.",
        h1: "Choose a D&D AI Game Master Campaign Route",
        heroMarkdown: "Start with an original D&D campaign situation, compare a fresh route with persistent campaign state, and choose one action the AI game master can resolve.",
        primaryCta: "Carry the AI roleplay campaign decision into Playworlds",
        ipBoundary: {
          schemaVersion: 1,
          contentBasis: "original_tabletop_fantasy",
          dndReferenceScope: "audience_reference_only",
          srdMaterialUsed: false,
          thirdPartyNames: [],
        },
        sections: [
          { id: "separate-the-jobs", role: "direct_answer", format: "prose", heading: "Separate the two starting jobs", bodyMarkdown: sectionBodies[0] },
          { id: "compare-the-routes", role: "failure_analysis", format: "comparison", heading: "See where campaign prep gets wasted", bodyMarkdown: sectionBodies[1] },
          { id: "apply-the-rule", role: "framework", format: "checklist", heading: "Apply a three-question prep rule", bodyMarkdown: sectionBodies[2] },
          { id: "work-the-example", role: "worked_example", format: "prose", heading: "Work one original campaign example", bodyMarkdown: sectionBodies[3] },
          { id: "carry-the-choice", role: "next_step", format: "callout", heading: "Carry one qualified choice forward", bodyMarkdown: sectionBodies[4] },
        ],
        faqs: [
          { id: "faq-existing-plot", job: "definition", question: "What does persistent campaign state change about the start?", answerMarkdown: "It lets a returning player resume saved campaign context, so the next preparation decision can focus on one unresolved pressure and one attempted action instead of rebuilding the campaign from scratch." },
          { id: "faq-better-route", job: "decision", question: "Is a persistent campaign always better than a fresh start?", answerMarkdown: "No. The comparison is about fit. Resume when the saved campaign state contains pressure worth advancing; start fresh when establishing an original premise is the work you want to do." },
          { id: "faq-product-boundary", job: "constraint", question: "What can this guide confirm about Playworlds?", answerMarkdown: "It can use the approved single-player voice-or-text RPG, AI game master, persistent-campaign, and tracked-state facts. It cannot promise a particular scenario, price, release state, privacy property, response speed, or outcome." },
        ],
        architecture: {
          schemaVersion: 1,
          intent: {
            searcherJob: candidates[0].decisionEvidence.searcherJob,
            painPointId: "campaign_prep_overload",
            decisionToEnable: "Choose between establishing a fresh campaign and resuming persistent campaign state before visiting Playworlds.",
            oneSentenceAnswer: "Use the Playworlds AI game master and persistent campaign state to turn one bounded prep decision into a voice-or-text adventure attempt.",
            nonGoals: ["Do not teach a full beginner roleplay workflow.", "Do not rank products or promise an outcome."],
          },
          content: {
            archetype: "comparison",
            thesis: "The useful decision is not which route is universally best, but whether a fresh premise or persistent campaign state removes the right setup work.",
            originalContribution: "A decision sequence that maps campaign-prep intent to persistent state, one attempted action, and a measured next step.",
            tone: "Precise and mature for an adult tabletop campaign prep discussion.",
            openingMove: "before_after_contrast",
            avoidPhrases: ["unlock your imagination", "endless possibilities", "step into a world"],
            sections: [
              { id: "separate-the-jobs", role: "direct_answer", format: "prose", readerQuestion: "What decision am I actually making?", uniqueTakeaway: "The two routes require different kinds of setup work." },
              { id: "compare-the-routes", role: "failure_analysis", format: "comparison", readerQuestion: "Where does campaign preparation become waste?", uniqueTakeaway: "Compare context, pressure, and decisions that can reach the table." },
              { id: "apply-the-rule", role: "framework", format: "checklist", readerQuestion: "How can a Game Master choose without overpreparing?", uniqueTakeaway: "Three questions turn preparation pressure into a route choice." },
              { id: "work-the-example", role: "worked_example", format: "prose", readerQuestion: "How does the rule work in an original campaign situation?", uniqueTakeaway: "A bounded example shows which preparation survives player choice." },
              { id: "carry-the-choice", role: "next_step", format: "callout", readerQuestion: "What should I do after the route is clear?", uniqueTakeaway: "Make one intentional, attributed visit with the boundary understood." },
            ],
            faqs: [
              { id: "faq-existing-plot", job: "definition", readerObstacle: "The reader does not understand what supplied context changes.", answerBoundary: "Explain the setup difference without claiming story availability." },
              { id: "faq-better-route", job: "decision", readerObstacle: "The reader expects a universal winner.", answerBoundary: "Frame the choice as fit, not a ranking." },
              { id: "faq-product-boundary", job: "constraint", readerObstacle: "The reader may infer unsupported product capabilities.", answerBoundary: "Restate the approved-fact boundary." },
            ],
            signature: {
              id: "route-evidence-switchboard",
              type: "comparison",
              readerAction: "Run the route check",
              afterSectionId: "compare-the-routes"
            }
          },
          differentiation: {
            against: [{
              slug: existingPage.slug,
              intentDelta: "Playworlds entry choice, not archive upkeep.",
              answerDelta: "Fresh versus persistent campaign routes.",
              structureDelta: "Decision switchboard with a worked scenario.",
              faqDelta: "Product-fit and route-choice objections.",
              visualDelta: "Nocturne route-control presentation.",
            }],
          },
          presentation: {
            recipeId: "nocturne-decision-grid-v1",
            rendererId: "nocturne_decision_grid",
            visualSystemId: "nocturne-control-room",
            layoutId: "branching-decision-grid",
            paletteId: "midnight-amber",
            typographyId: "technical-grotesk-mono",
            motifId: "illuminated-route-switch",
            companion: "none",
            gallery: "none",
            surfaceCopy: {
              eyebrow: "Route control / trial decision",
              shortAnswerLabel: "Decision in one line",
              contentsLabel: "Route checkpoints",
              sectionLabel: "Signal",
              faqEyebrow: "Control-room notes",
              faqHeading: "Questions to clear before departure",
              relatedHeading: "Continue from this decision",
              finalCtaEyebrow: "Destination confirmed",
              finalCtaHeading: "Carry the prep choice into Playworlds.",
              finalCtaBody: "Use the attributed Steam destination only after the fresh-or-persistent campaign route matches the preparation job you want to solve.",
              backToTop: "Return to route control"
            }
          }
        },
        signatureModule: {
          id: "route-evidence-switchboard",
          type: "comparison",
          title: "The route evidence switchboard",
          intro: "Move across three signals before choosing a route. Each signal changes what the reader must supply and what can happen next.",
          items: [
            { label: "Signal 01", title: "Campaign state", bodyMarkdown: "Decide whether you want to establish a fresh premise or resume a persistent campaign with unresolved pressure." },
            { label: "Signal 02", title: "Attempt", bodyMarkdown: "Choose one action to speak or type for the AI game master to interpret and resolve." },
            { label: "Signal 03", title: "Consequence", bodyMarkdown: "Name the player, party, inventory, or journey state that should change if the attempted action matters." }
          ]
        },
        factIdsUsed: ["dnd-content-direction", "dnd-primary-audience", "playworlds-current-product", "playworlds-voice-text-single-player-rpg", "playworlds-ai-game-master", "playworlds-persistent-campaigns", "playworlds-rpg-state"],
        internalLinks: [{
          anchor: "Review the unrelated campaign archive workflow",
          href: existingPage.path,
        }],
        assetBriefs: ["Use only original campaign-state and AI game-master imagery."],
        quality: { checks: [{ id: "distinct-intent", label: "Answers one trial-ready job", passed: true, detail: "The page targets a D&D reader evaluating an AI game master for campaign preparation." }] },
      },
    };
    bindBigQueryTrendEvidence(input);
    const inputPath = join(workspace, "data", "research", "2099-01-01.json");

    const architectureClaimInput = structuredClone(input);
    architectureClaimInput.contentStrategy.oneSentenceAnswer = "Use the real-time story route to make an immediate role decision before entering the scene.";
    architectureClaimInput.draft.architecture.intent.oneSentenceAnswer = architectureClaimInput.contentStrategy.oneSentenceAnswer;
    await writeFile(inputPath, `${JSON.stringify(architectureClaimInput, null, 2)}\n`);
    const architectureClaimBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(architectureClaimBuild.status, 0);
    assert.match(architectureClaimBuild.stderr, /unsupported product claim/);

    const duplicateFactInput = structuredClone(input);
    duplicateFactInput.draft.factIdsUsed = ["playworlds-ai-game-master", "playworlds-ai-game-master"];
    await writeFile(inputPath, `${JSON.stringify(duplicateFactInput, null, 2)}\n`);
    const duplicateFactBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(duplicateFactBuild.status, 0);
    assert.match(duplicateFactBuild.stderr, /unapproved or missing product fact ID/);

    const historicalFactInput = structuredClone(input);
    historicalFactInput.draft.factIdsUsed.push("existing-story");
    await writeFile(inputPath, `${JSON.stringify(historicalFactInput, null, 2)}\n`);
    const historicalFactBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(historicalFactBuild.status, 0);
    assert.match(historicalFactBuild.stderr, /unapproved or missing product fact ID/);

    const historicalCandidateFactInput = structuredClone(input);
    historicalCandidateFactInput.candidates[0].decisionEvidence.productFactIds.push("existing-story");
    await writeFile(inputPath, `${JSON.stringify(historicalCandidateFactInput, null, 2)}\n`);
    const historicalCandidateFactBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(historicalCandidateFactBuild.status, 0);
    assert.match(historicalCandidateFactBuild.stderr, /unapproved product fact ID: existing-story/);

    const missingIpBoundaryInput = structuredClone(input);
    delete missingIpBoundaryInput.draft.ipBoundary;
    await writeFile(inputPath, `${JSON.stringify(missingIpBoundaryInput, null, 2)}\n`);
    const missingIpBoundaryBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(missingIpBoundaryBuild.status, 0);
    assert.match(missingIpBoundaryBuild.stderr, /exact original-only ipBoundary contract/);

    const protectedIpInput = structuredClone(input);
    protectedIpInput.draft.heroMarkdown += " Continue the example in Exandria.";
    await writeFile(inputPath, `${JSON.stringify(protectedIpInput, null, 2)}\n`);
    const protectedIpBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(protectedIpBuild.status, 0);
    assert.match(protectedIpBuild.stderr, /blocked third-party reference/);

    const protectedKeywordInput = structuredClone(input);
    const protectedKeyword = "vecna d&d campaign prep";
    protectedKeywordInput.candidates[0].keyword = protectedKeyword;
    protectedKeywordInput.draft.keyword = protectedKeyword;
    bindBigQueryTrendEvidence(protectedKeywordInput);
    protectedKeywordInput.evidence = protectedKeywordInput.evidence.map((item) => ({
      ...item,
      supports: [...item.supports, protectedKeyword],
    }));
    await writeFile(inputPath, `${JSON.stringify(protectedKeywordInput, null, 2)}\n`);
    const protectedKeywordBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(protectedKeywordBuild.status, 0);
    assert.match(protectedKeywordBuild.stderr, /blocked third-party reference/);

    const disguisedChildInput = structuredClone(input);
    disguisedChildInput.draft.heroMarkdown += " A cute mascot leads kids through a sticker workshop.";
    await writeFile(inputPath, `${JSON.stringify(disguisedChildInput, null, 2)}\n`);
    const disguisedChildBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(disguisedChildBuild.status, 0);
    assert.match(disguisedChildBuild.stderr, /child-directed framing/);

    const unknownEvidenceInput = structuredClone(input);
    unknownEvidenceInput.candidates[0].decisionEvidence.evidenceRefs = [
      "evidence-1",
      "missing-evidence",
    ];
    await writeFile(inputPath, `${JSON.stringify(unknownEvidenceInput, null, 2)}\n`);
    const unknownEvidenceBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(unknownEvidenceBuild.status, 0);
    assert.match(unknownEvidenceBuild.stderr, /references unknown evidence/);

    const unboundCannibalizationInput = structuredClone(input);
    unboundCannibalizationInput.candidates[0].decisionEvidence.cannibalizationClass = "same_intent";
    await writeFile(inputPath, `${JSON.stringify(unboundCannibalizationInput, null, 2)}\n`);
    const unboundCannibalizationBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(unboundCannibalizationBuild.status, 0);
    assert.match(unboundCannibalizationBuild.stderr, /needs nearestExistingSlug/);

    const unofficialTrendInput = structuredClone(input);
    unofficialTrendInput.trendCollection.sourceUrl = "https://example.com/trends";
    unofficialTrendInput.trendCollection.snapshotDigest =
      computeGoogleTrendsCollectionDigest(unofficialTrendInput.trendCollection);
    unofficialTrendInput.trendSignals = unofficialTrendInput.trendSignals.map((signal) => ({
      ...signal,
      sourceUrl: unofficialTrendInput.trendCollection.sourceUrl,
      snapshotDigest: unofficialTrendInput.trendCollection.snapshotDigest,
    }));
    await writeFile(inputPath, `${JSON.stringify(unofficialTrendInput, null, 2)}\n`);
    const unofficialTrendBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(unofficialTrendBuild.status, 0);
    assert.match(unofficialTrendBuild.stderr, /official Google Trends BigQuery dataset page/);

    const invalidTrendValueInput = structuredClone(input);
    invalidTrendValueInput.trendSignals[0].relativeInterest = 101;
    await writeFile(inputPath, `${JSON.stringify(invalidTrendValueInput, null, 2)}\n`);
    const invalidTrendValueBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(invalidTrendValueBuild.status, 0);
    assert.match(invalidTrendValueBuild.stderr, /must not infer nationwide relativeInterest/);

    const missingTrendInput = structuredClone(input);
    delete missingTrendInput.trendSignals;
    delete missingTrendInput.trendCollection;
    await writeFile(inputPath, `${JSON.stringify(missingTrendInput, null, 2)}\n`);
    const missingTrendBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(missingTrendBuild.status, 0);
    assert.match(missingTrendBuild.stderr, /Create-page Google Trends gate failed/);

    const unavailableSelectedTrendInput = structuredClone(input);
    bindBigQueryTrendEvidence(unavailableSelectedTrendInput, { selectedObserved: false });
    await writeFile(inputPath, `${JSON.stringify(unavailableSelectedTrendInput, null, 2)}\n`);
    const unavailableSelectedTrendBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(unavailableSelectedTrendBuild.status, 0);
    assert.match(unavailableSelectedTrendBuild.stderr, /Create-page Google Trends gate failed/);

    const weakSelectedTrendInput = structuredClone(input);
    delete weakSelectedTrendInput.trendCollection;
    weakSelectedTrendInput.trendSignals = [{
      keyword: keywords[0],
      source: "google_trends",
      sourceUrl: "https://trends.google.com/trends/explore?geo=US&q=ai%20roleplay%20story",
      state: "observed",
      relativeInterest: 100,
      direction: "rising",
      geo: "US",
      period: "past 12 months",
      collectedAt: "2099-01-01T09:05:00+08:00",
      detail: "A legacy Explore signal cannot clear the unattended BigQuery v2 gate.",
    }];
    await writeFile(inputPath, `${JSON.stringify(weakSelectedTrendInput, null, 2)}\n`);
    const weakSelectedTrendBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(weakSelectedTrendBuild.status, 0);
    assert.match(weakSelectedTrendBuild.stderr, /exact top_rising_terms match/);

    const missingBreakoutEvidenceInput = structuredClone(input);
    missingBreakoutEvidenceInput.evidence = missingBreakoutEvidenceInput.evidence.map((item) => {
      const { kind, signal, ...ordinaryEvidence } = item;
      return ordinaryEvidence;
    });
    await writeFile(inputPath, `${JSON.stringify(missingBreakoutEvidenceInput, null, 2)}\n`);
    const missingBreakoutEvidenceBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(missingBreakoutEvidenceBuild.status, 0);
    assert.match(missingBreakoutEvidenceBuild.stderr, /Create-page breakout evidence gate failed/);

    const staleBreakoutEvidenceInput = structuredClone(input);
    staleBreakoutEvidenceInput.evidence[2].collectedAt = "2098-12-31T09:00:00+08:00";
    await writeFile(inputPath, `${JSON.stringify(staleBreakoutEvidenceInput, null, 2)}\n`);
    const staleBreakoutEvidenceBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(staleBreakoutEvidenceBuild.status, 0);
    assert.match(staleBreakoutEvidenceBuild.stderr, /must be collected on the report's Shanghai date/);

    const unsupportedBreakoutEvidenceInput = structuredClone(input);
    unsupportedBreakoutEvidenceInput.evidence[2].supports = keywords.slice(1);
    await writeFile(inputPath, `${JSON.stringify(unsupportedBreakoutEvidenceInput, null, 2)}\n`);
    const unsupportedBreakoutEvidenceBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(unsupportedBreakoutEvidenceBuild.status, 0);
    assert.match(unsupportedBreakoutEvidenceBuild.stderr, /Create-page breakout evidence gate failed/);

    const undersizedCandidateInput = structuredClone(input);
    undersizedCandidateInput.candidates = undersizedCandidateInput.candidates.slice(0, 7);
    await writeFile(inputPath, `${JSON.stringify(undersizedCandidateInput, null, 2)}\n`);
    const undersizedCandidateBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(undersizedCandidateBuild.status, 0);
    assert.match(undersizedCandidateBuild.stderr, /Research requires 8-12 candidates/);

    const nearDuplicateIntentInput = structuredClone(input);
    nearDuplicateIntentInput.candidates[1].keyword = "d&d ai game master campaign preparation";
    nearDuplicateIntentInput.candidates[1].decisionEvidence.searcherJob =
      "Use an AI game master with persistent campaign state to reduce repeat D&D preparation, then choose one original scene action for the next session.";
    await writeFile(inputPath, `${JSON.stringify(nearDuplicateIntentInput, null, 2)}\n`);
    const nearDuplicateIntentBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(nearDuplicateIntentBuild.status, 0);
    assert.match(nearDuplicateIntentBuild.stderr, /semantically distinct candidate intents/);
    assert.match(nearDuplicateIntentBuild.stderr, /Near-duplicate candidates/);

    const mostlyIneligibleInput = structuredClone(input);
    mostlyIneligibleInput.candidates = mostlyIneligibleInput.candidates.map((candidate, index) => ({
      ...candidate,
      funnelStage: index === 0 ? candidate.funnelStage : "problem",
    }));
    await writeFile(inputPath, `${JSON.stringify(mostlyIneligibleInput, null, 2)}\n`);
    const mostlyIneligibleBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(mostlyIneligibleBuild.status, 0);
    assert.match(
      mostlyIneligibleBuild.stderr,
      /semantically distinct candidates that passed all gates with action=create_page; found 1/,
    );

    const unavailablePortfolioInput = structuredClone(input);
    unavailablePortfolioInput.portfolioFunnels = {
      schemaVersion: 2,
      privacyClass: "public_growth_evidence",
      generatedAt: "2099-01-01T09:00:00+08:00",
      periodBasis: "complete_shanghai_calendar_days",
      reportingWindowDays: 28,
      reportingLagDays: 3,
      aggregationKey: "source_slug+reporting_period",
      periodStart: "2098-12-05T00:00:00+08:00",
      periodEnd: "2099-01-01T00:00:00+08:00",
      summary: {
        publishedPages: 1,
        collectedPages: 0,
        unavailablePages: 1,
        attributionJoinReady: false,
        attributionJoinBlocked: false,
        hasSearchValidatedLandingPage: false,
      },
      globalAttribution: {
        schemaVersion: 1,
        product: "playworlds",
        state: "unavailable",
        attributionJoinReady: false,
        detail: "The independent Playworlds callback fixture probe was unavailable.",
      },
      entries: [{
        sourceSlug: existingPage.slug,
        path: existingPage.path,
        keyword: existingPage.keyword,
        state: "unavailable",
        reason: "The protected growth endpoint returned HTTP 503 for this published page.",
      }],
    };
    unavailablePortfolioInput.portfolioDecision.evidenceSlugs = [existingPage.slug];
    await writeFile(inputPath, `${JSON.stringify(unavailablePortfolioInput, null, 2)}\n`);
    const unavailablePortfolioBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(unavailablePortfolioBuild.status, 0);
    assert.match(unavailablePortfolioBuild.stderr, /Create-page growth readiness gate failed/);

    await mkdir(join(workspace, "data", "seo-feedback", "inbox"), { recursive: true });
    const feedbackMessage = "  Keep the exact page intent narrow.\n\nDo not flatten this feedback.  ";
    await writeFile(
      join(workspace, "data", "seo-feedback", "inbox", "2098-12-31.json"),
      `${JSON.stringify({
        date: "2098-12-31",
        entries: [{
          id: "feedback-verbatim-fixture",
          createdAt: "2098-12-31T08:00:00.000Z",
          message: feedbackMessage,
          source: "workbench",
          kind: "content_guidance",
        }],
      }, null, 2)}\n`,
    );
    await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);
    const missingFeedbackDecisionBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(missingFeedbackDecisionBuild.status, 0);
    assert.match(missingFeedbackDecisionBuild.stderr, /cover all 1 unconsumed workbench entries/);

    input.feedbackDecisions = [{
      id: "feedback-verbatim-fixture",
      date: "2098-12-31",
      message: feedbackMessage,
      decision: "adopted",
      rationale: "The draft keeps one trial-ready task and preserves the requested narrow intent.",
    }];
    await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);

    const build = spawnSync(process.execPath, [builderPath, inputPath], { cwd: workspace, encoding: "utf8" });
    assert.equal(build.status, 0, build.stderr);
    const reportPath = join(workspace, "data", "reports", "2099-01-01.json");
    const reportBeforeReview = JSON.parse(await readFile(reportPath, "utf8"));
    const { parseReport } = await import("../lib/seo/report-store.ts?bigquery-v2-report");
    assert.doesNotThrow(() => parseReport(JSON.stringify(reportBeforeReview), "bigquery-v2-report.json"));
    assert.equal(reportBeforeReview.policyVersion, 4);
    assert.equal(reportBeforeReview.opportunities[0].scoreBasis, "evidence_signals_v1");
    assert.deepEqual(
      reportBeforeReview.opportunities[0].decisionEvidence.evidenceRefs,
      ["evidence-1", "evidence-2"],
    );
    assert.equal(isReportDraft(reportBeforeReview.draft), true);
    assert.equal(
      reportBeforeReview.publication.status,
      "ready_for_review",
      JSON.stringify({ publication: reportBeforeReview.publication, quality: reportBeforeReview.draft.quality }),
    );
    assert.equal(reportBeforeReview.publicationMode, "create");
    assert.equal(reportBeforeReview.funnel, undefined);
    assert.equal(reportBeforeReview.portfolioFunnels.schemaVersion, 2);
    assert.equal(reportBeforeReview.portfolioFunnels.privacyClass, "public_growth_evidence");
    assert.equal(reportBeforeReview.portfolioFunnels.conversionJoinKey, undefined);
    assert.equal(reportBeforeReview.portfolioFunnels.summary.publishedPages, 1);
    assert.equal(reportBeforeReview.portfolioFunnels.periodBasis, "complete_shanghai_calendar_days");
    assert.equal(reportBeforeReview.portfolioFunnels.reportingWindowDays, 28);
    assert.equal(reportBeforeReview.portfolioFunnels.reportingLagDays, 3);
    const privateOutcomeKeys = new Set([
      "conversionJoinKey",
      "funnel",
      "trialStarts",
      "signups",
      "paidConversions",
      "revenueMinor",
      "currency",
      "purchaseEvents",
      "orphanCallbacks",
      "revenueByCurrency",
      "pageviews",
      "outboundRequests",
      "ctaLocations",
    ]);
    assert.deepEqual(
      nestedKeys(reportBeforeReview.portfolioFunnels)
        .filter((key) => privateOutcomeKeys.has(key)),
      [],
    );
    assert.equal(reportBeforeReview.portfolioDecision.action, "create_page");
    assert.equal(reportBeforeReview.candidateIntentGate.state, "passed");
    assert.equal(reportBeforeReview.candidateIntentGate.requiredDistinctCreateIntents, 8);
    assert.equal(reportBeforeReview.candidateIntentGate.eligibleDistinctCreateIntents, 8);
    assert.equal(reportBeforeReview.candidateIntentGate.selectedKeyword, keywords[0]);
    assert.equal(reportBeforeReview.candidateIntentGate.eligibleFallbackCount, 7);
    assert.deepEqual(
      reportBeforeReview.candidateIntentGate.eligibleFallbacks.map((fallback) => fallback.rank),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.ok(reportBeforeReview.candidateIntentGate.eligibleFallbacks.every((fallback) =>
      fallback.action === "create_page" && fallback.keyword !== keywords[0]));
    assert.equal(reportBeforeReview.trendSignals[0].relativeInterest, null);
    assert.equal(reportBeforeReview.trendSignals[0].source, "google_trends");
    assert.equal(reportBeforeReview.trendSignals[0].schemaVersion, 2);
    assert.equal(reportBeforeReview.trendSignals[1].state, "not_observed");
    assert.equal(reportBeforeReview.trendSignals[1].relativeInterest, null);
    assert.equal(reportBeforeReview.trendCollection.provider, "google_trends_bigquery_public_dataset");
    assert.equal(reportBeforeReview.trendSignals[0].snapshotDigest, reportBeforeReview.trendCollection.snapshotDigest);
    assert.equal(reportBeforeReview.evidence[2].kind, "breakout_page");
    assert.deepEqual(reportBeforeReview.evidence[2].signal, input.evidence[2].signal);
    assert.equal(reportBeforeReview.feedbackDecisions.length, 1);
    assert.equal(reportBeforeReview.feedbackDecisions[0].message, feedbackMessage);
    assert.equal(reportBeforeReview.feedbackDecisions[0].decision, "adopted");
    assert.match(reportBeforeReview.publication.draftDigest, /^[a-f0-9]{64}$/);
    await assert.rejects(readFile(join(workspace, "data", "pages", "play-an-ai-roleplay-story.json"), "utf8"), /ENOENT/);
    const duplicateBuild = spawnSync(process.execPath, [builderPath, inputPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(duplicateBuild.status, 0);
    assert.match(duplicateBuild.stderr, /Refusing to overwrite existing daily report/);

    const previewDirectory = join(workspace, "output", "previews", "2099-01-01");
    const previewPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const previewSha256 = createHash("sha256").update(previewPng).digest("hex");
    await mkdir(previewDirectory, { recursive: true });
    await Promise.all(["desktop", "mobile"].map((id) =>
      writeFile(join(previewDirectory, `play-an-ai-roleplay-story-${id}.png`), previewPng)));

    const review = {
      schemaVersion: 1,
      reportId: "seo-2099-01-01",
      slug: "play-an-ai-roleplay-story",
      decision: "approved",
      reviewerType: "codex_editor",
      reviewer: "Codex editorial review",
      reviewedAt: "2099-01-01T12:00:00.000Z",
      notes: "A second editorial pass confirmed the intent, product truth, sources, and attributed CTA path.",
      draftDigest: reportBeforeReview.publication.draftDigest,
      checks: [
        { id: "search-intent", passed: true, detail: "The page answers one specific trial-ready searcher job." },
        { id: "product-truth", passed: true, detail: "Every capability statement maps to an approved fact ID." },
        { id: "conversion-path", passed: true, detail: "The CTA uses the attributed Playworlds Steam redirect contract." },
        { id: "source-accuracy", passed: true, detail: "Evidence supports the intent and is not presented as product proof." },
        { id: "content-distinctness", passed: true, detail: "The answer shape, section jobs, FAQ jobs, and wording passed the automated novelty audit." },
        { id: "presentation-distinctness", passed: true, detail: "The nocturne decision grid is explicit and passes the recipe reuse policy." },
        { id: "signature-module", passed: true, detail: "The route evidence switchboard is useful, original, and present in initial HTML." },
        { id: "rendered-preview", passed: true, detail: "The structured renderer contract includes the hero, layers, signature, FAQ, CTA, and optional-decoration states." },
        { id: "adult-tabletop-audience", passed: true, detail: "The visible copy serves adult tabletop players and Game Masters without child-directed framing." },
        { id: "original-ip-boundary", passed: true, detail: "The editor confirmed that all examples and visible assets are original tabletop fantasy and use D&D only as an audience reference." },
      ],
      visualAudit: {
        schemaVersion: 1,
        draftDigest: reportBeforeReview.publication.draftDigest,
        inspectedAt: "2099-01-01T11:30:00.000Z",
        previewPath: "/workbench/preview/play-an-ai-roleplay-story",
        passed: true,
        viewports: [
          {
            id: "desktop",
            width: 1440,
            height: 1000,
            screenshotPath: "output/previews/2099-01-01/play-an-ai-roleplay-story-desktop.png",
            screenshotSha256: previewSha256,
            h1Lines: 3,
            h1ViewportRatio: 0.3,
            ctaInFirstViewport: true,
            horizontalOverflowPx: 0,
            rawMarkdownVisible: false,
            signatureVisible: true,
            maxUniformNumberedRun: 2,
          },
          {
            id: "mobile",
            width: 390,
            height: 844,
            screenshotPath: "output/previews/2099-01-01/play-an-ai-roleplay-story-mobile.png",
            screenshotSha256: previewSha256,
            h1Lines: 4,
            h1ViewportRatio: 0.3,
            ctaInFirstViewport: true,
            horizontalOverflowPx: 0,
            rawMarkdownVisible: false,
            signatureVisible: true,
            maxUniformNumberedRun: 2,
          },
        ],
      },
    };
    const reviewPath = join(workspace, "data", "reviews", "2099-01-01.json");
    await mkdir(dirname(reviewPath), { recursive: true });
    await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);

    const tamperedReport = structuredClone(reportBeforeReview);
    tamperedReport.draft.h1 = "A different draft after approval";
    await writeFile(reportPath, `${JSON.stringify(tamperedReport, null, 2)}\n`);
    const tamperedPublish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(tamperedPublish.status, 0);
    assert.match(tamperedPublish.stderr, /SHA-256 digest/);

    const tamperedStrategy = structuredClone(reportBeforeReview);
    tamperedStrategy.contentStrategy.readerOutcome = "A different reader outcome inserted after editorial approval.";
    await writeFile(reportPath, `${JSON.stringify(tamperedStrategy, null, 2)}\n`);
    const tamperedStrategyPublish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(tamperedStrategyPublish.status, 0);
    assert.match(tamperedStrategyPublish.stderr, /SHA-256 digest/);

    const tamperedTrendEvidence = structuredClone(reportBeforeReview);
    tamperedTrendEvidence.trendCollection.detail =
      "A different, structurally valid collection detail was inserted after editorial approval.";
    tamperedTrendEvidence.trendCollection.snapshotDigest =
      computeGoogleTrendsCollectionDigest(tamperedTrendEvidence.trendCollection);
    tamperedTrendEvidence.trendSignals = tamperedTrendEvidence.trendSignals.map((signal) => ({
      ...signal,
      snapshotDigest: tamperedTrendEvidence.trendCollection.snapshotDigest,
    }));
    await writeFile(reportPath, `${JSON.stringify(tamperedTrendEvidence, null, 2)}\n`);
    const tamperedTrendPublish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(tamperedTrendPublish.status, 0);
    assert.match(tamperedTrendPublish.stderr, /signature verification failed/);

    const protectedPublisherReport = structuredClone(reportBeforeReview);
    protectedPublisherReport.draft.heroMarkdown += " Continue the campaign in the Sword Coast.";
    const protectedPublisherDigest = createHash("sha256")
      .update(JSON.stringify({
        draft: protectedPublisherReport.draft,
        contentStrategy: protectedPublisherReport.contentStrategy,
        googleTrendsSnapshotDigest: protectedPublisherReport.trendCollection.snapshotDigest,
      }))
      .digest("hex");
    protectedPublisherReport.publication.draftDigest = protectedPublisherDigest;
    const protectedPublisherReview = structuredClone(review);
    protectedPublisherReview.draftDigest = protectedPublisherDigest;
    protectedPublisherReview.visualAudit.draftDigest = protectedPublisherDigest;
    await writeFile(reportPath, `${JSON.stringify(protectedPublisherReport, null, 2)}\n`);
    await writeFile(reviewPath, `${JSON.stringify(protectedPublisherReview, null, 2)}\n`);
    const protectedPublisherPublish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(protectedPublisherPublish.status, 0);
    assert.match(protectedPublisherPublish.stderr, /blocked third-party reference/);
    await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);

    const missingTrendPublisherBypass = structuredClone(reportBeforeReview);
    missingTrendPublisherBypass.trendSignals = [];
    delete missingTrendPublisherBypass.trendCollection;
    await writeFile(reportPath, `${JSON.stringify(missingTrendPublisherBypass, null, 2)}\n`);
    const missingTrendBypassPublish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(missingTrendBypassPublish.status, 0);
    assert.match(missingTrendBypassPublish.stderr, /Create-page Google Trends gate failed/);

    const missingBreakoutPublisherBypass = structuredClone(reportBeforeReview);
    missingBreakoutPublisherBypass.evidence = missingBreakoutPublisherBypass.evidence.map((item) => {
      const { kind, signal, ...ordinaryEvidence } = item;
      return ordinaryEvidence;
    });
    await writeFile(reportPath, `${JSON.stringify(missingBreakoutPublisherBypass, null, 2)}\n`);
    const missingBreakoutBypassPublish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(missingBreakoutBypassPublish.status, 0);
    assert.match(missingBreakoutBypassPublish.stderr, /Create-page breakout evidence gate failed/);

    const unavailableGrowthPublisherBypass = structuredClone(reportBeforeReview);
    unavailableGrowthPublisherBypass.portfolioFunnels.summary.attributionJoinReady = false;
    unavailableGrowthPublisherBypass.portfolioFunnels.globalAttribution.attributionJoinReady = false;
    unavailableGrowthPublisherBypass.portfolioFunnels.globalAttribution.detail =
      "The independent Playworlds callback fixture probe did not pass.";
    await writeFile(reportPath, `${JSON.stringify(unavailableGrowthPublisherBypass, null, 2)}\n`);
    const unavailableGrowthBypassPublish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(unavailableGrowthBypassPublish.status, 0);
    assert.match(unavailableGrowthBypassPublish.stderr, /Create-page growth readiness gate failed/);

    await writeFile(reportPath, `${JSON.stringify(reportBeforeReview, null, 2)}\n`);
    const desktopPreviewPath = join(previewDirectory, "play-an-ai-roleplay-story-desktop.png");
    await writeFile(desktopPreviewPath, Buffer.from("changed after editorial inspection"));
    const changedScreenshotPublish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(changedScreenshotPublish.status, 0);
    assert.match(changedScreenshotPublish.stderr, /screenshot digest changed after review/i);
    await writeFile(desktopPreviewPath, previewPng);

    const mobilePreviewPath = join(previewDirectory, "play-an-ai-roleplay-story-mobile.png");
    await rm(mobilePreviewPath);
    const missingScreenshotPublish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(missingScreenshotPublish.status, 0);
    assert.match(missingScreenshotPublish.stderr, /screenshot is missing/i);
    await writeFile(mobilePreviewPath, previewPng);

    const publisherSource = await readFile(publisherPath, "utf8");
    assert.equal(
      [...publisherSource.matchAll(/assertCreatePagePublicationReadiness\(/g)].length,
      3,
      "publisher must validate the initial report and the publication-guard reread",
    );

    await writeFile(reportPath, `${JSON.stringify(reportBeforeReview, null, 2)}\n`);

    const coordinationRoot = join(workspace, ".daily-coordination");
    const dailyRunId = "reviewed-publication-fixture";
    const lease = acquireDailyLease({
      coordinationRoot,
      date: "2099-01-01",
      owner: coordinationOwner(workspace, dailyRunId),
      now: new Date("2099-01-01T12:30:00.000Z"),
    });
    assert.equal(lease.outcome, "acquired");

    const publish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], {
      cwd: workspace,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        SEO_TEST_PUBLICATION_NOW: "2099-01-01T12:30:00.000Z",
        SEO_TEST_COORDINATION_ROOT: coordinationRoot,
        SEO_DAILY_RUN_ID: dailyRunId,
        CODEX_THREAD_ID: dailyRunId,
      },
    });
    assert.equal(publish.status, 0, publish.stderr);
    const page = JSON.parse(await readFile(join(workspace, "data", "pages", "play-an-ai-roleplay-story.json"), "utf8"));
    assert.equal(page.schemaVersion, 3);
    assert.equal(page.architecture.presentation.companion, "none");
    assert.equal(page.architecture.presentation.recipeId, "nocturne-decision-grid-v1");
    assert.equal(page.signatureModule.id, "route-evidence-switchboard");
    assert.equal(page.editorialReview.decision, "approved");
    assert.equal(page.draftDigest, review.draftDigest);
    assert.equal(page.publishedAt, "2099-01-01T12:30:00.000Z");
    assert.deepEqual(parseMarkdownBlocks(page.sections[1].bodyMarkdown).map((block) => block.type), ["prose", "list", "prose"]);
    assert.deepEqual(listMarkdownRenderBlocks(page.sections[2].bodyMarkdown, false).map((block) => block.type), ["prose", "list", "prose"]);
    assert.match(page.sections[1].bodyMarkdown, /\n1\.[\s\S]*\n2\./);
    assert.match(page.sections[2].bodyMarkdown, /\n- First[\s\S]*\n- Third/);
    const originalCwd = process.cwd();
    try {
      process.chdir(workspace);
      const { readPublishedPage } = await import("../lib/seo/page-store.ts?publisher-output");
      const storedPage = await readPublishedPage("play-an-ai-roleplay-story");
      assert.equal(storedPage?.schemaVersion, 3, "publisher output must remain readable through page-store");
      assert.equal(storedPage?.sections[2].bodyMarkdown, page.sections[2].bodyMarkdown);
    } finally {
      process.chdir(originalCwd);
    }
    const reportAfterReview = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(reportAfterReview.publication.status, "published");

    const falselyNewIntentInput = structuredClone(input);
    falselyNewIntentInput.candidates[0].keyword = "enter a prepared d&d campaign story";
    falselyNewIntentInput.candidates[0].decisionEvidence.searcherJob =
      "Compare a self-authored prompt with entering a supplied D&D campaign story, then select the starting route that fits this tabletop session.";
    bindBigQueryTrendEvidence(falselyNewIntentInput);
    falselyNewIntentInput.evidence = falselyNewIntentInput.evidence.map((item) => ({
      ...item,
      supports: [...item.supports, falselyNewIntentInput.candidates[0].keyword],
    }));
    await writeFile(inputPath, `${JSON.stringify(falselyNewIntentInput, null, 2)}\n`);
    const falselyNewIntentBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(falselyNewIntentBuild.status, 0);
    assert.match(falselyNewIntentBuild.stderr, /semantic near-duplicate of published \/play-an-ai-roleplay-story/);
    assert.match(falselyNewIntentBuild.stderr, /must use a non-new-intent binding/);

    await rm(join(pagesDirectory, `${existingPage.slug}.json`));

    const updateInput = structuredClone(input);
    delete updateInput.trendSignals;
    delete updateInput.trendCollection;
    updateInput.date = "2099-01-02";
    updateInput.generatedAt = "2099-01-02T09:15:00+08:00";
    updateInput.publicationMode = "update";
    const updateKeywords = [
      "personalize a d&d campaign story",
      "audit a d&d player character first reply",
      "diagnose a stalled d&d campaign session",
      "check d&d player character continuity",
      "tune d&d session reply pacing",
      "balance d&d encounter dialogue and action",
      "clarify a d&d player character motivation",
      "strengthen a d&d campaign choice consequence",
    ];
    const updateSearcherJobs = [
      "Improve the existing D&D campaign entry page by clarifying how a Game Master chooses between authoring a prompt and entering a prepared story.",
      "Audit one first D&D player character reply for a grounded session detail, an in-character action, and a hook that another turn can answer.",
      "Diagnose a stalled D&D campaign session and identify the smallest observation, action, or decision that can restore table momentum.",
      "Check whether a D&D response maintains the selected player character perspective after the campaign exchange has begun.",
      "Tune the length and pacing of a D&D session reply to match the amount of movement required by the current table scene.",
      "Balance dialogue and action in a D&D encounter without making either mode carry the entire campaign beat.",
      "Clarify one immediate motivation for a D&D player character so the next session response follows a coherent objective.",
      "Strengthen one D&D campaign choice by naming a visible consequence that changes the immediate session.",
    ];
    updateInput.candidates = updateInput.candidates.map((candidate, index) => ({
      ...candidate,
      keyword: updateKeywords[index],
      ...(index === 0 ? { existingUrl: "/play-an-ai-roleplay-story" } : {}),
      decisionEvidence: {
        ...candidate.decisionEvidence,
        searcherJob: updateSearcherJobs[index],
        cannibalizationClass: index === 0 ? "adjacent_intent" : "new_intent",
        nearestExistingSlug: index === 0 ? "play-an-ai-roleplay-story" : null,
      },
    }));
    updateInput.contentStrategy.searcherJob = updateInput.candidates[0].decisionEvidence.searcherJob;
    updateInput.draft.architecture.intent.searcherJob = updateInput.candidates[0].decisionEvidence.searcherJob;
    updateInput.evidence = updateInput.evidence.map((item) => ({
      ...item,
      collectedAt: "2099-01-02T09:00:00+08:00",
      supports: updateKeywords,
    }));
    updateInput.performance = [{
      url: "https://seo.example/play-an-ai-roleplay-story",
      query: updateKeywords[0],
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      position: 8,
      recommendedAction: "Improve the existing page around the observed query.",
    }];
    updateInput.portfolioFunnels = {
      ...updateInput.portfolioFunnels,
      generatedAt: "2099-01-02T09:10:00+08:00",
      periodStart: "2098-12-05T16:00:00.000Z",
      periodEnd: "2099-01-01T16:00:00.000Z",
      summary: {
        publishedPages: 1,
        collectedPages: 0,
        unavailablePages: 1,
        attributionJoinReady: false,
        attributionJoinBlocked: false,
        hasSearchValidatedLandingPage: false,
      },
      globalAttribution: {
        schemaVersion: 1,
        product: "playworlds",
        state: "unavailable",
        attributionJoinReady: false,
        detail: "The independent Playworlds callback fixture probe was unavailable.",
      },
      entries: [{
        sourceSlug: "play-an-ai-roleplay-story",
        path: "/play-an-ai-roleplay-story",
        keyword: keywords[0],
        state: "unavailable",
        reason: "Private attribution is unavailable in this isolated update fixture.",
      }],
    };
    updateInput.portfolioDecision = {
      schemaVersion: 1,
      action: "improve_page",
      targetSlug: "play-an-ai-roleplay-story",
      rationale: "An observed Search Console row points to the existing page, so the decision is to improve that route rather than create a duplicate.",
      evidenceSlugs: ["play-an-ai-roleplay-story"],
    };
    updateInput.funnel.periodStart = "2098-12-06T00:00:00+08:00";
    updateInput.funnel.periodEnd = "2099-01-02T09:00:00+08:00";
    updateInput.draft.keyword = updateKeywords[0];
    updateInput.draft.slug = "/play-an-ai-roleplay-story";
    updateInput.draft.generatedAt = "2099-01-02T09:15:00+08:00";
    updateInput.draft.architecture.differentiation.against = [];
    updateInput.draft.internalLinks = [{
      anchor: "Review the existing roleplay entry guide",
      href: "/play-an-ai-roleplay-story",
    }];
    const updateInputPath = join(workspace, "data", "research", "2099-01-02.json");
    await writeFile(updateInputPath, `${JSON.stringify(updateInput, null, 2)}\n`);

    const selfLinkUpdateBuild = spawnSync(process.execPath, [builderPath, updateInputPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(selfLinkUpdateBuild.status, 0);
    assert.match(selfLinkUpdateBuild.stderr, /Internal link target is not a published route/);

    updateInput.draft.internalLinks = [];
    await writeFile(updateInputPath, `${JSON.stringify(updateInput, null, 2)}\n`);

    const updateBuild = spawnSync(process.execPath, [builderPath, updateInputPath], { cwd: workspace, encoding: "utf8" });
    assert.equal(updateBuild.status, 0, updateBuild.stderr);
    const updateReport = JSON.parse(await readFile(join(workspace, "data", "reports", "2099-01-02.json"), "utf8"));
    assert.equal(updateReport.publicationMode, "update");
    assert.equal(updateReport.publication.slug, "play-an-ai-roleplay-story");
    assert.equal(updateReport.brief.slug, "/play-an-ai-roleplay-story");
    assert.deepEqual(updateReport.trendSignals, []);

    const publishedReport = JSON.parse(await readFile(reportPath, "utf8"));
    await rm(join(workspace, "data", "pages", "play-an-ai-roleplay-story.json"));
    await mkdir(join(workspace, "data", "maintenance"), { recursive: true });
    await writeFile(
      join(workspace, "data", "maintenance", "2099-01-01-retirement.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        authorization: "Direct test authorization to retire this publication.",
        retiredPages: ["play-an-ai-roleplay-story"],
        retiredPublications: [{
          schemaVersion: 1,
          action: "retire_published_page",
          originalPublicationDate: "2099-01-01",
          slug: "play-an-ai-roleplay-story",
          reportId: publishedReport.id,
          draftDigest: publishedReport.publication.draftDigest,
          publishedAt: publishedReport.publication.publishedAt,
          retiredAt: "2099-01-01T13:00:00.000Z",
          reason: "The fixture explicitly retires the published page while preserving its historical review chain.",
        }],
      }, null, 2)}\n`,
    );
    const republishAfterRetirement = spawnSync(
      process.execPath,
      [publisherPath, reportPath, reviewPath],
      { cwd: workspace, encoding: "utf8" },
    );
    assert.notEqual(republishAfterRetirement.status, 0);
    assert.match(
      republishAfterRetirement.stderr,
      /already ended with retired publication \/play-an-ai-roleplay-story; the daily slot cannot be reused/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
