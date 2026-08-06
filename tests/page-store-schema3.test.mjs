import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
    ["compare", "comparison", "comparison"],
    ["rule", "decision_rule", "checklist"],
    ["next", "next_step", "callout"],
  ];
  const faqPlans = [
    ["faq-definition", "definition"],
    ["faq-decision", "decision"],
    ["faq-constraint", "constraint"],
  ];
  const checks = [
    "search-intent",
    "product-truth",
    "conversion-path",
    "source-accuracy",
    "content-distinctness",
    "presentation-distinctness",
    "signature-module",
    "rendered-preview",
  ].map((id) => ({ id, passed: true, detail: `The ${id} requirement passed with specific reviewed evidence.` }));
  const page = {
    schemaVersion: 3,
    status: "published",
    slug: "schema-three-route",
    path: "/schema-three-route",
    keyword: "schema three route",
    publishedAt: "2099-01-01T04:00:00.000Z",
    updatedAt: "2099-01-01T04:05:00.000Z",
    generatedFromReport: "seo-2099-01-01",
    draftDigest,
    pagePattern: "decision_page",
    title: "Choose a Story Route With a Reviewed Decision Contract",
    metaDescription: "Compare two original story-entry routes with a reviewed decision structure, approved product facts, and an explicit attributed next step.",
    h1: "Choose a Story Route",
    heroMarkdown: "Compare the setup work each route asks you to do, then choose the path whose context and perspective match the action you want to take.",
    primaryCta: "Explore story-led roleplay on NovelAI",
    sections: sectionPlans.map(([id, role, format], index) => ({
      id,
      role,
      format,
      heading: `Reviewed content layer ${index + 1}`,
      bodyMarkdown: `This original layer ${index + 1} performs a separate reader job and stays within the approved story and role-selection facts. It identifies the exact choice in front of the visitor, explains what evidence belongs to that choice, and keeps each conclusion inside the documented boundary.\n\nThe layer then gives the reader a concrete way to apply the distinction in practice today without borrowing a character, promising a result, or repeating the job assigned to another section.`,
    })),
    faqs: faqPlans.map(([id, job], index) => ({
      id,
      job,
      question: `What does reviewed FAQ ${index + 1} resolve?`,
      answerMarkdown: `It resolves one specific ${job} obstacle with a direct boundary, a practical distinction, and no unsupported product claim or invented availability statement.`,
    })),
    factIdsUsed: ["existing-story", "role-selection"],
    internalLinks: [],
    assetBriefs: [],
    architecture: {
      schemaVersion: 1,
      intent: {
        searcherJob: "Choose between two story-entry routes after comparing the setup work each route requires.",
        painPointId: "choice_uncertainty",
        decisionToEnable: "Select one route and name the immediate next action.",
        oneSentenceAnswer: "Choose the route whose supplied context and perspective match the work you want to do.",
        nonGoals: ["Do not rank every roleplay product.", "Do not promise a particular scenario."],
      },
      content: {
        archetype: "comparison",
        thesis: "A useful route choice compares setup work rather than declaring a universal winner.",
        originalContribution: "A compact decision grid that separates context, perspective, and next action.",
        tone: "Precise and evaluative like a control-room route check.",
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
