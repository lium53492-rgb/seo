import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const builderPath = join(repoRoot, "scripts", "build-free-research-report.mjs");
const publisherPath = join(repoRoot, "scripts", "publish-reviewed-page.mjs");

const unavailable = (source, detail) => ({ status: "unavailable", value: null, source, detail });

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
    }));
    const supports = [...keywords];
    const paragraph = Array.from({ length: 5 }, (_, index) => `Step ${index + 1} keeps the reader inside an original plot, connects the selected role to a clear scene, and explains the next decision without inventing product capabilities or borrowing a familiar fictional world.`).join(" ");
    const input = {
      policyVersion: 3,
      date: "2099-01-01",
      generatedAt: "2099-01-01T09:15:00+08:00",
      contentStrategy: {
        searcherJob: "Find an AI roleplay story that can be entered immediately through a concrete role.",
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
      evidence: Array.from({ length: 5 }, (_, index) => ({
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
        keyword: keywords[0],
        slug: "/play-an-ai-roleplay-story",
        language: "en",
        reviewRequired: true,
        title: "Play an AI Roleplay Story by Entering an Existing Plot",
        metaDescription: "Learn how to enter an original AI roleplay story, choose an available character, and move from a clear opening scene toward a measured trial step.",
        h1: "Play an AI Roleplay Story",
        heroMarkdown: "Start with an original story already in motion, choose an available role, and decide whether this story-led format matches the way you want to participate.",
        primaryCta: "Explore stories on NovelAI",
        sections: Array.from({ length: 4 }, (_, index) => ({ heading: `Decision step ${index + 1}`, bodyMarkdown: paragraph })),
        faqs: Array.from({ length: 3 }, (_, index) => ({ question: `How does decision ${index + 1} work?`, answerMarkdown: "Use the existing plot and the available role as the boundary for the next original response." })),
        factIdsUsed: ["voice-roleplay-format", "existing-story", "role-selection"],
        internalLinks: [],
        assetBriefs: ["Use only original story and role imagery."],
        quality: { checks: [{ id: "distinct-intent", label: "Answers one trial-ready job", passed: true, detail: "The page targets a reader who wants to enter a story now." }] },
      },
    };
    const inputPath = join(workspace, "data", "research", "2099-01-01.json");
    await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);

    const build = spawnSync(process.execPath, [builderPath, inputPath], { cwd: workspace, encoding: "utf8" });
    assert.equal(build.status, 0, build.stderr);
    const reportPath = join(workspace, "data", "reports", "2099-01-01.json");
    const reportBeforeReview = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(reportBeforeReview.policyVersion, 3);
    assert.equal(reportBeforeReview.publication.status, "ready_for_review");
    assert.equal(reportBeforeReview.publicationMode, "create");
    assert.equal(reportBeforeReview.funnel.aggregationKey, "source_slug+reporting_period");
    assert.equal(reportBeforeReview.funnel.conversionJoinKey, "seo_click_id");
    assert.equal(reportBeforeReview.funnel.joinKey, undefined);
    assert.equal(reportBeforeReview.portfolioFunnels.summary.publishedPages, 0);
    assert.equal(reportBeforeReview.portfolioFunnels.periodBasis, "complete_shanghai_calendar_days");
    assert.equal(reportBeforeReview.portfolioDecision.action, "create_page");
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

    await writeFile(reportPath, `${JSON.stringify(reportBeforeReview, null, 2)}\n`);

    const publish = spawnSync(process.execPath, [publisherPath, reportPath, reviewPath], { cwd: workspace, encoding: "utf8" });
    assert.equal(publish.status, 0, publish.stderr);
    const page = JSON.parse(await readFile(join(workspace, "data", "pages", "play-an-ai-roleplay-story.json"), "utf8"));
    assert.equal(page.schemaVersion, 2);
    assert.equal(page.editorialReview.decision, "approved");
    assert.equal(page.draftDigest, review.draftDigest);
    const reportAfterReview = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(reportAfterReview.publication.status, "published");

    const updateInput = structuredClone(input);
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
    }));
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
    updateInput.draft.internalLinks = [{
      anchor: "Review the existing roleplay entry guide",
      href: "/play-an-ai-roleplay-story",
    }];
    const updateInputPath = join(workspace, "data", "research", "2099-01-02.json");
    await writeFile(updateInputPath, `${JSON.stringify(updateInput, null, 2)}\n`);

    const updateBuild = spawnSync(process.execPath, [builderPath, updateInputPath], { cwd: workspace, encoding: "utf8" });
    assert.equal(updateBuild.status, 0, updateBuild.stderr);
    const updateReport = JSON.parse(await readFile(join(workspace, "data", "reports", "2099-01-02.json"), "utf8"));
    assert.equal(updateReport.publicationMode, "update");
    assert.equal(updateReport.publication.slug, "play-an-ai-roleplay-story");
    assert.equal(updateReport.brief.slug, "/play-an-ai-roleplay-story");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
