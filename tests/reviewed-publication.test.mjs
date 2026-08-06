import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { isReportDraft } from "../lib/seo/report-draft-validation.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const builderPath = join(repoRoot, "scripts", "build-free-research-report.mjs");
const publisherPath = join(repoRoot, "scripts", "publish-reviewed-page.mjs");

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

test("report generation cannot publish before a separate approval artifact", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "seo-workflow-"));
  try {
    await mkdir(join(workspace, "data", "config"), { recursive: true });
    await cp(join(repoRoot, "data", "config"), join(workspace, "data", "config"), { recursive: true });
    await mkdir(join(workspace, "data", "research"), { recursive: true });

    const keywords = [
      "play an ai roleplay story",
      "start an ai voice story",
      "try a story roleplay game",
      "choose a role story game",
      "interactive story roleplay trial",
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
        searcherJob: `Enter ${keyword} immediately and decide whether this product format is worth trying.`,
        productFactIds: [
          "voice-roleplay-format",
          "existing-story",
          "role-selection",
          "interactive-fiction-history",
        ],
        productSignals: [
          "voice_roleplay",
          "story_premise",
          "role_selection",
          "interactive_fiction",
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
      "A useful entry decision begins by separating two very different jobs. A blank-prompt route asks the reader to supply a premise before anything can happen. A story-led route begins with an existing plot, so the first decision is whether that supplied situation already creates a reason to participate. Read the opening for one unresolved pressure, one available perspective, and one immediate consequence. That comparison prevents a generic greeting from standing in for a real choice. It also keeps the explanation inside approved product facts: the page can describe an existing story and role selection without promising a specific world, character, platform, price, response speed, or technical voice behavior.",
      "Compare the routes with a small evidence grid rather than a feature checklist. In the first column, write what context the reader must invent. In the second, write what context is already present.\n\nThen note where the point of view comes from and what the reader can decide next. The story-led side should show that an available role narrows the perspective, while the blank side leaves that work open. Neither route is declared universally better. The grid exists to help a trial-ready searcher recognize which starting condition matches the action they want to take now, using original language and no borrowed fictional setting.",
      "Use a three-question decision rule after the comparison. First, do you want to build the premise or respond to one that is already moving?\n\nSecond, do you want to invent a speaker or choose from the roles made available by the story?\n\nThird, can you name one scene-level action you would take after that choice? Three clear answers create a reasoned next step; uncertainty on any answer tells the reader what to inspect again. This rule is deliberately narrower than a broad beginner tutorial because it resolves one route choice before the reader reaches the opening scene.",
      "When the route is clear, carry only the decision forward. Open the attributed destination intentionally in a new tab, inspect an existing premise, and choose an available role if the format fits. The page does not start a session, guarantee an outcome, or claim that every imagined scenario exists. Its job is to replace a vague product visit with a qualified one: the reader understands the story-led boundary, knows which perspective they would take, and can measure the next action through the approved redirect and downstream attribution chain without exposing protected commercial data in the public report.",
    ];
    const input = {
      policyVersion: 4,
      date: "2099-01-01",
      generatedAt: "2099-01-01T09:15:00+08:00",
      contentStrategy: {
        schemaVersion: 2,
        searcherJob: candidates[0].decisionEvidence.searcherJob,
        painPointId: "choice_uncertainty",
        readerStateBefore: "The reader wants to participate now but has not decided whether to invent a prompt or enter an existing story.",
        readerOutcome: "The reader can compare the two starting routes, choose one deliberately, and explain the next scene-level action.",
        primaryPainPoint: "The reader is close to trying a product but cannot tell which starting route removes the right kind of setup work.",
        oneSentenceAnswer: "Begin with an original plot, choose an available role, and enter the opening scene.",
        originalContribution: "A decision sequence that maps search intent to plot, role choice, and a measured next step.",
        pagePattern: "decision_page",
        productBridge: "The approved experience begins with an existing story and lets the player choose an available character.",
        contextualNextStep: "Send a qualified reader through the attributed NovelAI route after the decision barrier is resolved.",
        evidenceBoundary: "Use only the approved product fact catalog and public evidence for the searcher job.",
        conversionHypothesis: "Readers searching to play now should start a trial more often after seeing the exact entry sequence.",
        primaryConversion: "trial_start",
        measurementPlan: "Join outbound clicks to NovelAI trial and payment callbacks with seo_click_id.",
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
      })),
      performance: [],
      portfolioDecision: {
        schemaVersion: 1,
        action: "create_page",
        targetSlug: null,
        rationale: "The portfolio has no previous pages, so a first trial-ready page is the explicit cold-start decision.",
        evidenceSlugs: [],
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
          trialStarts: unavailable("product_analytics", "NovelAI trial callbacks are not connected in this fixture."),
          signups: unavailable("product_analytics", "NovelAI signup callbacks are not connected in this fixture."),
          paidConversions: unavailable("payments", "Payment callbacks are not connected in this fixture."),
          revenueMinor: unavailable("payments", "Attributed revenue is not connected in this fixture."),
        },
      },
      portfolioFunnels: {
        schemaVersion: 1,
        generatedAt: "2099-01-01T09:00:00+08:00",
        periodBasis: "complete_shanghai_calendar_days",
        reportingWindowDays: 28,
        reportingLagDays: 3,
        aggregationKey: "source_slug+reporting_period",
        conversionJoinKey: "seo_click_id",
        periodStart: "2098-12-05T00:00:00+08:00",
        periodEnd: "2099-01-01T00:00:00+08:00",
        summary: {
          publishedPages: 0,
          collectedPages: 0,
          unavailablePages: 0,
        },
        entries: [],
      },
      draft: {
        schemaVersion: 2,
        keyword: keywords[0],
        slug: "/play-an-ai-roleplay-story",
        model: "codex-test",
        generatedAt: "2099-01-01T09:15:00+08:00",
        language: "en",
        reviewRequired: true,
        title: "Play an AI Roleplay Story by Entering an Existing Plot",
        metaDescription: "Learn how to enter an original AI roleplay story, choose an available character, and move from a clear opening scene toward a measured trial step.",
        h1: "Play an AI Roleplay Story",
        heroMarkdown: "Start with an original story already in motion, choose an available role, and decide whether this story-led format matches the way you want to participate.",
        primaryCta: "Explore stories on NovelAI",
        sections: [
          { id: "separate-the-jobs", role: "direct_answer", format: "prose", heading: "Separate the two starting jobs", bodyMarkdown: sectionBodies[0] },
          { id: "compare-the-routes", role: "comparison", format: "comparison", heading: "Compare what each route asks you to supply", bodyMarkdown: sectionBodies[1] },
          { id: "apply-the-rule", role: "decision_rule", format: "checklist", heading: "Apply a three-question decision rule", bodyMarkdown: sectionBodies[2] },
          { id: "carry-the-choice", role: "next_step", format: "callout", heading: "Carry one qualified choice forward", bodyMarkdown: sectionBodies[3] },
        ],
        faqs: [
          { id: "faq-existing-plot", job: "definition", question: "What does an existing plot change about the start?", answerMarkdown: "It supplies an opening situation to inspect, so the reader can focus on choosing a perspective and responding to one immediate pressure instead of inventing an entire premise." },
          { id: "faq-better-route", job: "decision", question: "Is a story-led route always better than a blank prompt?", answerMarkdown: "No. The comparison is about fit. Choose a story-led route when you want supplied context and an available role; choose another route when inventing the premise is the work you want to do." },
          { id: "faq-product-boundary", job: "constraint", question: "What can this guide confirm about the product?", answerMarkdown: "It can use the approved story, role-selection, and experience facts. It cannot promise a particular scenario, platform, price, privacy property, response speed, or outcome." },
        ],
        architecture: {
          schemaVersion: 1,
          intent: {
            searcherJob: candidates[0].decisionEvidence.searcherJob,
            painPointId: "choice_uncertainty",
            decisionToEnable: "Choose between inventing a blank prompt and entering a supplied story before visiting the product.",
            oneSentenceAnswer: "Begin with an original plot, choose an available role, and enter the opening scene.",
            nonGoals: ["Do not teach a full beginner roleplay workflow.", "Do not rank products or promise an outcome."],
          },
          content: {
            archetype: "comparison",
            thesis: "The useful decision is not which route is universally best, but which kind of setup work the reader wants to do.",
            originalContribution: "A decision sequence that maps search intent to plot, role choice, and a measured next step.",
            tone: "Precise and evaluative, like a late-night control-room route check.",
            openingMove: "before_after_contrast",
            avoidPhrases: ["unlock your imagination", "endless possibilities", "step into a world"],
            sections: [
              { id: "separate-the-jobs", role: "direct_answer", format: "prose", readerQuestion: "What decision am I actually making?", uniqueTakeaway: "The two routes require different kinds of setup work." },
              { id: "compare-the-routes", role: "comparison", format: "comparison", readerQuestion: "What does each route ask me to supply?", uniqueTakeaway: "Compare context, perspective, and the next available action." },
              { id: "apply-the-rule", role: "decision_rule", format: "checklist", readerQuestion: "How can I decide without a generic ranking?", uniqueTakeaway: "Three questions turn preferences into a route choice." },
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
          differentiation: { against: [] },
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
              finalCtaHeading: "Carry the route choice into a story.",
              finalCtaBody: "Use the attributed destination only after the supplied-context route matches the experience you want.",
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
            { label: "Signal 01", title: "Context", bodyMarkdown: "Decide whether you want to invent the premise or inspect an opening situation that already contains pressure." },
            { label: "Signal 02", title: "Perspective", bodyMarkdown: "Decide whether you want to invent a speaker or narrow the response through an available story role." },
            { label: "Signal 03", title: "Next action", bodyMarkdown: "Name one scene-level move that follows from the chosen context and perspective before continuing." }
          ]
        },
        factIdsUsed: ["voice-roleplay-format", "existing-story", "role-selection"],
        internalLinks: [],
        assetBriefs: ["Use only original story and role imagery."],
        quality: { checks: [{ id: "distinct-intent", label: "Answers one trial-ready job", passed: true, detail: "The page targets a reader who wants to enter a story now." }] },
      },
    };
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
    duplicateFactInput.draft.factIdsUsed = ["existing-story", "existing-story"];
    await writeFile(inputPath, `${JSON.stringify(duplicateFactInput, null, 2)}\n`);
    const duplicateFactBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(duplicateFactBuild.status, 0);
    assert.match(duplicateFactBuild.stderr, /unapproved or missing product fact ID/);

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
    unofficialTrendInput.trendSignals[0].sourceUrl = "https://example.com/trends";
    await writeFile(inputPath, `${JSON.stringify(unofficialTrendInput, null, 2)}\n`);
    const unofficialTrendBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(unofficialTrendBuild.status, 0);
    assert.match(unofficialTrendBuild.stderr, /official Google Trends URL/);

    const invalidTrendValueInput = structuredClone(input);
    invalidTrendValueInput.trendSignals[0].relativeInterest = 101;
    await writeFile(inputPath, `${JSON.stringify(invalidTrendValueInput, null, 2)}\n`);
    const invalidTrendValueBuild = spawnSync(process.execPath, [builderPath, inputPath], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.notEqual(invalidTrendValueBuild.status, 0);
    assert.match(invalidTrendValueBuild.stderr, /relativeInterest must be an integer from 0 to 100/);

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
    assert.equal(reportBeforeReview.policyVersion, 4);
    assert.equal(reportBeforeReview.opportunities[0].scoreBasis, "evidence_signals_v1");
    assert.deepEqual(
      reportBeforeReview.opportunities[0].decisionEvidence.evidenceRefs,
      ["evidence-1", "evidence-2"],
    );
    assert.equal(isReportDraft(reportBeforeReview.draft), true);
    assert.equal(reportBeforeReview.publication.status, "ready_for_review");
    assert.equal(reportBeforeReview.publicationMode, "create");
    assert.equal(reportBeforeReview.funnel, undefined);
    assert.equal(reportBeforeReview.portfolioFunnels.schemaVersion, 2);
    assert.equal(reportBeforeReview.portfolioFunnels.privacyClass, "public_growth_evidence");
    assert.equal(reportBeforeReview.portfolioFunnels.conversionJoinKey, undefined);
    assert.equal(reportBeforeReview.portfolioFunnels.summary.publishedPages, 0);
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
    assert.equal(reportBeforeReview.trendSignals[0].relativeInterest, 67);
    assert.equal(reportBeforeReview.trendSignals[0].source, "google_trends");
    assert.equal(reportBeforeReview.trendSignals[1].state, "unavailable");
    assert.equal(reportBeforeReview.trendSignals[1].relativeInterest, null);
    assert.equal(reportBeforeReview.feedbackDecisions.length, 1);
    assert.equal(reportBeforeReview.feedbackDecisions[0].message, feedbackMessage);
    assert.equal(reportBeforeReview.feedbackDecisions[0].decision, "adopted");
    assert.match(reportBeforeReview.publication.draftDigest, /^[a-f0-9]{64}$/);
    await assert.rejects(readFile(join(workspace, "data", "pages", "play-an-ai-roleplay-story.json"), "utf8"), /ENOENT/);
    const duplicateBuild = spawnSync(process.execPath, [builderPath, inputPath], { cwd: workspace, encoding: "utf8" });
    assert.notEqual(duplicateBuild.status, 0);
    assert.match(duplicateBuild.stderr, /Refusing to overwrite existing daily report/);

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
        { id: "conversion-path", passed: true, detail: "The CTA uses the attributed NovelAI redirect contract." },
        { id: "source-accuracy", passed: true, detail: "Evidence supports the intent and is not presented as product proof." },
        { id: "content-distinctness", passed: true, detail: "The answer shape, section jobs, FAQ jobs, and wording passed the automated novelty audit." },
        { id: "presentation-distinctness", passed: true, detail: "The nocturne decision grid is explicit and passes the recipe reuse policy." },
        { id: "signature-module", passed: true, detail: "The route evidence switchboard is useful, original, and present in initial HTML." },
        { id: "rendered-preview", passed: true, detail: "The structured renderer contract includes the hero, layers, signature, FAQ, CTA, and optional-decoration states." },
      ],
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

    await writeFile(reportPath, `${JSON.stringify(reportBeforeReview, null, 2)}\n`);

    const publish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.equal(publish.status, 0, publish.stderr);
    const page = JSON.parse(await readFile(join(workspace, "data", "pages", "play-an-ai-roleplay-story.json"), "utf8"));
    assert.equal(page.schemaVersion, 3);
    assert.equal(page.architecture.presentation.companion, "none");
    assert.equal(page.architecture.presentation.recipeId, "nocturne-decision-grid-v1");
    assert.equal(page.signatureModule.id, "route-evidence-switchboard");
    assert.equal(page.editorialReview.decision, "approved");
    assert.equal(page.draftDigest, review.draftDigest);
    const reportAfterReview = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(reportAfterReview.publication.status, "published");

    const updateInput = structuredClone(input);
    delete updateInput.trendSignals;
    updateInput.date = "2099-01-02";
    updateInput.generatedAt = "2099-01-02T09:15:00+08:00";
    updateInput.publicationMode = "update";
    const updateKeywords = [
      "personalize an ai roleplay story",
      "improve an ai voice story",
      "refine a story roleplay game",
      "adjust a choose your role story",
      "update an interactive roleplay story",
    ];
    updateInput.candidates = updateInput.candidates.map((candidate, index) => ({
      ...candidate,
      keyword: updateKeywords[index],
      existingUrl: "/play-an-ai-roleplay-story",
      decisionEvidence: {
        ...candidate.decisionEvidence,
        searcherJob: `Improve ${updateKeywords[index]} on the existing route using observed query evidence.`,
        cannibalizationClass: "adjacent_intent",
        nearestExistingSlug: "play-an-ai-roleplay-story",
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
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
