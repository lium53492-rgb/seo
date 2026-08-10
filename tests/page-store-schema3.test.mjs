import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import test from "node:test";
import { servedContentDigest, visiblePageText } from "../lib/seo/served-content.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const emptyServerOnlyModule = "data:text/javascript,export {}";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: emptyServerOnlyModule, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const aliasedPath = specifier.slice(2);
      const path = join(projectRoot, aliasedPath.endsWith(".json") ? aliasedPath : `${aliasedPath}.ts`);
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

function schemaThreePage() {
  const draftDigest = "a".repeat(64);
  const sectionPlans = [
    ["answer", "direct_answer", "prose"],
    ["compare", "failure_analysis", "comparison"],
    ["rule", "framework", "checklist"],
    ["example", "worked_example", "examples"],
    ["next", "next_step", "callout"],
  ];
  const faqPlans = [
    ["faq-definition", "definition"],
    ["faq-decision", "decision"],
    ["faq-constraint", "constraint"],
  ];
  const semanticSectionBodies = {
    compare: [
      "This comparison layer starts with an explicit introduction that tells the reader why the route evidence belongs together.",
      "1. Compare how much opening context each route supplies before the reader takes an action.",
      "2. Compare where the available perspective comes from and which decision remains open afterward.",
      "The unmarked conclusion remains part of the reviewed section and turns those two observations into one bounded route choice without adding an unsupported product claim.",
    ].join("\n"),
    rule: [
      "This checklist layer introduces the evidence boundary before asking the reader to verify any individual condition.",
      "- Confirm that the opening context matches the work the reader wants to avoid or perform.",
      "- Confirm that an available perspective supports the immediate scene-level action the reader wants to take.",
      "The closing instruction remains visible after the checklist: stop and inspect the route again when either condition is still unclear, instead of inventing a capability or outcome.",
    ].join("\n"),
  };
  const checks = [
    "search-intent",
    "product-truth",
    "conversion-path",
    "source-accuracy",
    "content-distinctness",
    "presentation-distinctness",
    "signature-module",
    "rendered-preview",
    "adult-tabletop-audience",
    "original-ip-boundary",
  ].map((id) => ({ id, passed: true, detail: `The ${id} requirement passed with specific reviewed evidence.` }));
  const page = {
    schemaVersion: 3,
    status: "published",
    slug: "schema-three-route",
    path: "/schema-three-route",
    keyword: "adult d&d game master campaign prep framework",
    publishedAt: "2099-01-01T04:00:00.000Z",
    updatedAt: "2099-01-01T04:05:00.000Z",
    generatedFromReport: "seo-2099-01-01",
    draftDigest,
    pagePattern: "decision_page",
    title: "A Campaign Prep Framework for Adult D&D Game Masters",
    metaDescription: "Reduce campaign-prep pressure with an original, table-ready D&D framework for adult Game Masters, including a worked example and a concrete next step.",
    h1: "Run Tonight's D&D Campaign With Less Prep",
    heroMarkdown: "Use this mature tabletop framework to identify the one campaign decision that matters tonight, prepare only the evidence your players can reach, and leave the rest open for play.",
    primaryCta: "Explore D&D-focused campaign content on NovelAI",
    ipBoundary: {
      schemaVersion: 1,
      contentBasis: "original_tabletop_fantasy",
      dndReferenceScope: "audience_reference_only",
      srdMaterialUsed: false,
      thirdPartyNames: [],
    },
    sections: sectionPlans.map(([id, role, format], index) => ({
      id,
      role,
      format,
      heading: `Reviewed content layer ${index + 1}`,
      bodyMarkdown: semanticSectionBodies[id] ?? `This original layer ${index + 1} performs a separate campaign-prep job for an adult D&D Game Master and stays within the approved product facts. It identifies the exact table decision in front of the group, explains what evidence belongs to that decision, and keeps each conclusion inside the documented boundary.\n\nThe layer then gives the Game Master a concrete way to apply the distinction in tonight's tabletop session without borrowing a protected setting or character, promising a result, or repeating the job assigned to another section.`,
    })),
    faqs: faqPlans.map(([id, job], index) => ({
      id,
      job,
      question: `What does reviewed FAQ ${index + 1} resolve?`,
      answerMarkdown: `It resolves one specific ${job} obstacle with a direct boundary, a practical distinction, and no unsupported product claim or invented availability statement.`,
    })),
    factIdsUsed: ["dnd-content-direction", "dnd-primary-audience", "existing-story", "role-selection"],
    internalLinks: [],
    assetBriefs: [],
    architecture: {
      schemaVersion: 1,
      intent: {
        searcherJob: "Help an adult D&D Game Master reduce campaign-prep pressure before tonight's tabletop session.",
        painPointId: "campaign_prep_overload",
        decisionToEnable: "Select the one campaign decision that needs preparation and name the immediate table action.",
        oneSentenceAnswer: "Prepare the decision your players can reach tonight, then leave unreachable branches open for live play.",
        nonGoals: ["Do not reproduce protected setting material.", "Do not promise a particular campaign outcome."],
      },
      content: {
        archetype: "comparison",
        thesis: "Useful D&D campaign prep follows reachable player decisions instead of attempting to script every branch.",
        originalContribution: "A compact table-ready decision grid that separates reachable context, player agency, and the next Game Master action.",
        tone: "Mature adult tabletop field notes for a time-pressed D&D Game Master.",
        openingMove: "before_after_contrast",
        avoidPhrases: ["endless possibilities", "unlock creativity", "step into magic"],
        sections: sectionPlans.map(([id, role, format], index) => ({
          id,
          role,
          format,
          readerQuestion: `Which reader question belongs to layer ${index + 1}?`,
          uniqueTakeaway: `Layer ${index + 1} adds a distinct decision takeaway.`,
        })),
        faqs: faqPlans.map(([id, job], index) => ({
          id,
          job,
          readerObstacle: `The reader faces obstacle ${index + 1}.`,
          answerBoundary: `Answer only the ${job} question with approved facts.`,
        })),
        signature: {
          id: "schema-three-switchboard",
          type: "comparison",
          readerAction: "Run the route check",
          afterSectionId: "compare",
        },
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
          eyebrow: "Route control",
          shortAnswerLabel: "Decision in one line",
          contentsLabel: "Route checkpoints",
          sectionLabel: "Signal",
          faqEyebrow: "Control notes",
          faqHeading: "Questions before departure",
          relatedHeading: "Continue this decision",
          finalCtaEyebrow: "Destination ready",
          finalCtaHeading: "Carry the choice into a story.",
          finalCtaBody: "Use the attributed route only after the starting condition fits.",
          backToTop: "Return to route control",
        },
      },
    },
    signatureModule: {
      id: "schema-three-switchboard",
      type: "comparison",
      title: "The reviewed route switchboard",
      intro: "Compare three signals before selecting the route that matches the work you want to do.",
      items: [
        { label: "01", title: "Context", bodyMarkdown: "Decide whether context is supplied or invented, then record which setup work remains for the reader." },
        { label: "02", title: "Perspective", bodyMarkdown: "Decide how the response gets its point of view and which available evidence supports that choice." },
        { label: "03", title: "Action", bodyMarkdown: "Name one immediate move after the route choice while keeping the next scene deliberately open." },
      ],
    },
    quality: {
      passed: true,
      wordCount: 700,
      checks: [
        { id: "content-contract", label: "Content contract", passed: true, detail: "Every content layer matches the reviewed architecture." },
        { id: "content-distinctness", label: "Content distinctness", passed: true, detail: "The complete novelty audit has no content violations." },
        { id: "presentation-distinctness", label: "Presentation distinctness", passed: true, detail: "The selected recipe passed its registered reuse policy." },
        { id: "optional-decoration", label: "Optional decoration", passed: true, detail: "Gallery and companion policies are explicit for this route." },
      ],
      novelty: {
        schemaVersion: 1,
        passed: true,
        corpusDigest: "b".repeat(64),
        nearest: [],
        internal: { maxSectionPairCosine: 0.2, maxFaqPairCosine: 0.2, repeatedSentenceCount: 0 },
        violations: [],
      },
    },
    editorialReview: {
      schemaVersion: 1,
      reportId: "seo-2099-01-01",
      slug: "schema-three-route",
      decision: "approved",
      reviewerType: "codex_editor",
      reviewer: "Codex editorial review",
      reviewedAt: "2099-01-01T04:05:00.000Z",
      notes: "A separate editorial pass approved the content, presentation, signature, and rendered preview contracts.",
      draftDigest,
      checks,
      visualAudit: {
        schemaVersion: 1,
        draftDigest,
        inspectedAt: "2099-01-01T04:04:00.000Z",
        previewPath: "/workbench/preview/schema-three-route",
        passed: true,
        viewports: [
          {
            id: "desktop",
            width: 1440,
            height: 1000,
            screenshotPath: "output/previews/2099-01-01/schema-three-route-desktop.png",
            screenshotSha256: "c".repeat(64),
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
            screenshotPath: "output/previews/2099-01-01/schema-three-route-mobile.png",
            screenshotSha256: "d".repeat(64),
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
    },
    research: { opportunityScore: 88, demandProxy: 60, competitionProxy: 40, evidenceCount: 5 },
  };
  page.quality.wordCount = (visiblePageText(page).match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
  page.servedContentDigest = servedContentDigest(page);
  return page;
}

test("page store exposes a reviewed schema-version 3 route", async () => {
  const originalCwd = process.cwd();
  const workspace = await mkdtemp(join(tmpdir(), "seo-page-store-v3-"));
  try {
    process.chdir(workspace);
    const pagesDirectory = join(workspace, "data", "pages");
    await mkdir(pagesDirectory, { recursive: true });
    const pagePath = join(pagesDirectory, "schema-three-route.json");
    const releasedPage = schemaThreePage();
    assert.ok(releasedPage.quality.wordCount >= 600 && releasedPage.quality.wordCount <= 1000,
      `schema-3 fixture word count: ${releasedPage.quality.wordCount}`);
    await writeFile(pagePath, `${JSON.stringify(releasedPage, null, 2)}\n`);
    const { readPublishedPage } = await import("../lib/seo/page-store.ts");
    const page = await readPublishedPage("schema-three-route");
    assert.equal(page?.schemaVersion, 3);
    assert.equal(page?.architecture?.presentation.recipeId, "nocturne-decision-grid-v1");
    assert.match(page?.sections.find((section) => section.id === "compare")?.bodyMarkdown ?? "", /introduction[\s\S]*\n1\.[\s\S]*\n2\.[\s\S]*conclusion/);
    assert.match(page?.sections.find((section) => section.id === "rule")?.bodyMarkdown ?? "", /boundary[\s\S]*\n- Confirm[\s\S]*\n- Confirm[\s\S]*closing instruction/);

    const preservedLegacyPage = JSON.parse(await readFile(
      join(projectRoot, "data", "pages", "ai-roleplay-prompt-vs-existing-story.json"),
      "utf8",
    ));
    const preservedLegacyPath = join(pagesDirectory, `${preservedLegacyPage.slug}.json`);
    await writeFile(preservedLegacyPath, `${JSON.stringify(preservedLegacyPage, null, 2)}\n`);
    assert.equal((await readPublishedPage(preservedLegacyPage.slug))?.schemaVersion, 2);

    const forgedLegacyPage = structuredClone(preservedLegacyPage);
    forgedLegacyPage.h1 = "A generic legacy page reusing the approved release identity";
    await writeFile(preservedLegacyPath, `${JSON.stringify(forgedLegacyPage, null, 2)}\n`);
    assert.equal(await readPublishedPage(preservedLegacyPage.slug), null);

    const futureLegacyPage = structuredClone(preservedLegacyPage);
    futureLegacyPage.publishedAt = "2026-08-11T01:00:00.000Z";
    futureLegacyPage.updatedAt = futureLegacyPage.publishedAt;
    await writeFile(preservedLegacyPath, `${JSON.stringify(futureLegacyPage, null, 2)}\n`);
    assert.equal(await readPublishedPage(preservedLegacyPage.slug), null);

    const unlistedLegacyPage = structuredClone(preservedLegacyPage);
    unlistedLegacyPage.slug = "unlisted-legacy-route";
    unlistedLegacyPage.path = `/${unlistedLegacyPage.slug}`;
    unlistedLegacyPage.editorialReview.slug = unlistedLegacyPage.slug;
    await writeFile(
      join(pagesDirectory, `${unlistedLegacyPage.slug}.json`),
      `${JSON.stringify(unlistedLegacyPage, null, 2)}\n`,
    );
    assert.equal(await readPublishedPage(unlistedLegacyPage.slug), null);

    const jobOnlyPage = structuredClone(releasedPage);
    jobOnlyPage.keyword = "adult campaign session prep workflow";
    jobOnlyPage.h1 = "Prepare Tonight's Campaign Session";
    jobOnlyPage.architecture.intent.searcherJob = "Help an adult facilitator prepare a campaign session and opening encounter without naming a specific hobby audience.";
    jobOnlyPage.quality.wordCount = (visiblePageText(jobOnlyPage).match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
    jobOnlyPage.servedContentDigest = servedContentDigest(jobOnlyPage);
    await writeFile(pagePath, `${JSON.stringify(jobOnlyPage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    const tamperedIpContractPage = structuredClone(releasedPage);
    tamperedIpContractPage.ipBoundary.contentBasis = "licensed_setting_material";
    assert.notEqual(servedContentDigest(tamperedIpContractPage), releasedPage.servedContentDigest,
      "the runtime digest must bind the structured IP contract when it is present");
    await writeFile(pagePath, `${JSON.stringify(tamperedIpContractPage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    const childDirectedVisiblePage = structuredClone(releasedPage);
    childDirectedVisiblePage.heroMarkdown += " A cute mascot leads kids through a sticker workshop.";
    childDirectedVisiblePage.quality.wordCount = (visiblePageText(childDirectedVisiblePage).match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
    childDirectedVisiblePage.servedContentDigest = servedContentDigest(childDirectedVisiblePage);
    await writeFile(pagePath, `${JSON.stringify(childDirectedVisiblePage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    const preEnforcementJobOnlyPage = structuredClone(jobOnlyPage);
    preEnforcementJobOnlyPage.generatedFromReport = "seo-2026-08-10";
    preEnforcementJobOnlyPage.editorialReview.reportId = preEnforcementJobOnlyPage.generatedFromReport;
    preEnforcementJobOnlyPage.servedContentDigest = servedContentDigest(preEnforcementJobOnlyPage);
    await writeFile(pagePath, `${JSON.stringify(preEnforcementJobOnlyPage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null,
      "schema 3 has no pre-enforcement legacy lane; an old report ID cannot bypass current policy");

    const missingIpBoundaryPage = structuredClone(releasedPage);
    delete missingIpBoundaryPage.ipBoundary;
    missingIpBoundaryPage.servedContentDigest = servedContentDigest(missingIpBoundaryPage);
    await writeFile(pagePath, `${JSON.stringify(missingIpBoundaryPage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    const protectedReferencePage = structuredClone(releasedPage);
    protectedReferencePage.heroMarkdown += " This route visits the Sword Coast.";
    protectedReferencePage.quality.wordCount = (visiblePageText(protectedReferencePage).match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
    protectedReferencePage.servedContentDigest = servedContentDigest(protectedReferencePage);
    await writeFile(pagePath, `${JSON.stringify(protectedReferencePage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    const audienceOnlyPage = structuredClone(releasedPage);
    audienceOnlyPage.keyword = "adult d&d tabletop guide";
    audienceOnlyPage.h1 = "An Adult D&D Tabletop Guide";
    audienceOnlyPage.architecture.intent.searcherJob = "Help an adult D&D tabletop reader understand the hobby and evaluate this general guide.";
    audienceOnlyPage.quality.wordCount = (visiblePageText(audienceOnlyPage).match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
    audienceOnlyPage.servedContentDigest = servedContentDigest(audienceOnlyPage);
    await writeFile(pagePath, `${JSON.stringify(audienceOnlyPage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    const preEnforcementPage = structuredClone(audienceOnlyPage);
    preEnforcementPage.generatedFromReport = "seo-2026-08-10";
    preEnforcementPage.editorialReview.reportId = preEnforcementPage.generatedFromReport;
    preEnforcementPage.servedContentDigest = servedContentDigest(preEnforcementPage);
    await writeFile(pagePath, `${JSON.stringify(preEnforcementPage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null,
      "a schema-3 artifact cannot spoof an old report date to bypass the D&D-first gates");

    const undatedPage = structuredClone(audienceOnlyPage);
    undatedPage.generatedFromReport = "seo-undated";
    undatedPage.editorialReview.reportId = undatedPage.generatedFromReport;
    undatedPage.servedContentDigest = servedContentDigest(undatedPage);
    await writeFile(pagePath, `${JSON.stringify(undatedPage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    const childDirectedCampaignPage = structuredClone(releasedPage);
    childDirectedCampaignPage.architecture.content.tone = "Playful child-directed campaign fun with bright mascot energy.";
    childDirectedCampaignPage.servedContentDigest = servedContentDigest(childDirectedCampaignPage);
    await writeFile(pagePath, `${JSON.stringify(childDirectedCampaignPage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    const retiredPage = structuredClone(releasedPage);
    retiredPage.slug = "ai-roleplay-first-message";
    retiredPage.path = "/ai-roleplay-first-message";
    retiredPage.editorialReview.slug = retiredPage.slug;
    retiredPage.servedContentDigest = servedContentDigest(retiredPage);
    const retiredPagePath = join(pagesDirectory, `${retiredPage.slug}.json`);
    await writeFile(retiredPagePath, `${JSON.stringify(retiredPage, null, 2)}\n`);
    assert.equal(await readPublishedPage(retiredPage.slug), null);

    const malformedArchitecture = structuredClone(releasedPage);
    for (const section of malformedArchitecture.sections) section.role = "comparison";
    for (const section of malformedArchitecture.architecture.content.sections) section.role = "comparison";
    malformedArchitecture.servedContentDigest = servedContentDigest(malformedArchitecture);
    await writeFile(pagePath, `${JSON.stringify(malformedArchitecture, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    const contradictoryAudit = structuredClone(releasedPage);
    contradictoryAudit.quality.novelty.nearest = [{
      slug: "impossible-nearest-page",
      wholeTextCosine: 1,
      titleCosine: 0,
      metaDescriptionCosine: 0,
      h1Cosine: 0,
      heroCosine: 0,
      maxSectionHeadingCosine: 0,
      maxSectionPairCosine: 0,
      maxFaqQuestionCosine: 0,
      maxFaqPairCosine: 0,
      maxSurfaceCopyCosine: 0,
      matchedFaqPairs: 0,
      fiveWordShingleContainment: 0,
      repeatedSentenceCount: 0,
      repeatedSentences: [],
    }];
    await writeFile(pagePath, `${JSON.stringify(contradictoryAudit, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);

    releasedPage.h1 = "Tampered after the release digest was recorded";
    await writeFile(pagePath, `${JSON.stringify(releasedPage, null, 2)}\n`);
    assert.equal(await readPublishedPage("schema-three-route"), null);
  } finally {
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  }
});
