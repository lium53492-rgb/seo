import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  validateArchitecturePolicy,
  validatePageArchitecture,
  validatePresentationRecipeCatalog,
  validateSeoArchitectureBridge,
} from "../lib/seo/content-contract.mjs";
import { analyzeContentNovelty } from "../lib/seo/content-similarity.mjs";
import { publishedArchitectureHistoryFromReports } from "../lib/seo/content-history.mjs";
import { visiblePageText } from "../lib/seo/served-content.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const architecturePolicy = await readJson("../data/config/content-architecture.json");
const presentationCatalog = await readJson("../data/config/presentation-recipes.json");
const productFacts = await readJson("../data/config/product-facts.json");
const seoPolicy = await readJson("../data/config/seo-policy.json");

function fixture() {
  const searcherJob = "Write one useful first roleplay response after a story and available role have already supplied the context.";
  const oneSentenceAnswer = "Notice one live detail, make one modest move, and leave one unresolved hook for the next turn.";
  const originalContribution = "A worked-example lab that annotates one original reply and diagnoses three different failure modes.";
  const sections = [
    { id: "contrast", role: "comparison", format: "comparison", heading: "Contrast a closed reply with a playable reply", bodyMarkdown: "A closed reply reports a mood but gives the scene no new pressure. A playable reply attaches an observation to a modest action and leaves one fact unresolved.\n\nThe difference is not length. It is whether another turn has a specific detail, movement, or question to answer without importing a borrowed world." },
    { id: "framework", role: "framework", format: "steps", heading: "Build the response from three beats", bodyMarkdown: "1. Begin with a concrete thing the chosen perspective can notice.\n2. Add an action small enough that it does not resolve the whole situation.\n3. Finish with a hook that creates one answerable pressure. The three beats can fit inside a concise reply and do not require a biography or an invented product capability." },
    { id: "example", role: "worked_example", format: "examples", heading: "Annotate one original first reply", bodyMarkdown: "Use an abstract scene: a sealed envelope sits where it should not be. The reply notices the broken wax, moves the envelope away from the doorway, and asks who knew the room would be empty.\n\nEach sentence performs a different job, and none depends on a protected character, franchise, or claimed scenario." },
    { id: "repair", role: "failure_analysis", format: "checklist", heading: "Repair the exact beat that failed", bodyMarkdown: "If the reply feels vague, replace a general emotion with an observable detail.\n\nIf it feels controlling, reduce the action so the scene still has room to respond.\n\nIf it feels finished, reopen one uncertainty. Change only the failed beat so the response keeps its perspective and does not become a generic rewrite." },
  ];
  const faqs = [
    { id: "faq-length", job: "setup", question: "How long should the first response be?", answerMarkdown: "Use only enough space to show one detail, one modest action, and one hook. A longer history is not required for this specific task." },
    { id: "faq-dialogue", job: "decision", question: "Does the reply need dialogue?", answerMarkdown: "No. Dialogue, action, or a focused thought can work when it performs one of the three beats and leaves the scene room to continue." },
    { id: "faq-claims", job: "constraint", question: "What does this example prove about the product?", answerMarkdown: "It illustrates a writing decision only. Product statements remain limited to the approved story-led format and role-selection facts." },
  ];
  const architecture = {
    schemaVersion: 1,
    intent: {
      searcherJob,
      painPointId: "quality_repair",
      decisionToEnable: "Turn supplied story context into one playable first response without copying a prompt.",
      oneSentenceAnswer,
      nonGoals: ["Do not provide a full beginner guide.", "Do not promise a particular story or response outcome."],
    },
    content: {
      archetype: "worked_examples",
      thesis: "A first response becomes playable when each sentence performs a distinct scene-level job.",
      originalContribution,
      tone: "Tactile and instructional, like a rehearsal slate with one marked take.",
      openingMove: "worked_example",
      avoidPhrases: ["endless possibilities", "bring characters to life", "start your journey"],
      sections: [
        { id: "contrast", role: "comparison", format: "comparison", readerQuestion: "Why do some short replies stall?", uniqueTakeaway: "Playability comes from an answerable change, not length." },
        { id: "framework", role: "framework", format: "steps", readerQuestion: "What jobs must the response perform?", uniqueTakeaway: "Detail, action, and hook each do different work." },
        { id: "example", role: "worked_example", format: "examples", readerQuestion: "What does the framework look like in one original reply?", uniqueTakeaway: "An annotated reply makes each beat visible." },
        { id: "repair", role: "failure_analysis", format: "checklist", readerQuestion: "How do I repair a reply without rewriting everything?", uniqueTakeaway: "Change only the beat that failed." },
      ],
      faqs: [
        { id: "faq-length", job: "setup", readerObstacle: "The reader expects a required length.", answerBoundary: "Explain functional length without promising an outcome." },
        { id: "faq-dialogue", job: "decision", readerObstacle: "The reader thinks dialogue is mandatory.", answerBoundary: "Explain format choice through the three jobs." },
        { id: "faq-claims", job: "constraint", readerObstacle: "The reader may confuse an example with product proof.", answerBoundary: "Restate the approved-fact boundary." },
      ],
      signature: {
        id: "notice-move-hook-workbench",
        type: "worked_example",
        readerAction: "Mark the three beats",
        afterSectionId: "framework",
      },
    },
    differentiation: { against: [] },
    presentation: {
      recipeId: "rehearsal-slate-v1",
      rendererId: "rehearsal_slate",
      visualSystemId: "rehearsal-slate",
      layoutId: "asymmetric-script-columns",
      paletteId: "film-stock-red",
      typographyId: "condensed-slate-mono",
      motifId: "notice-move-hook-clapper",
      companion: "none",
      gallery: "none",
      surfaceCopy: {
        eyebrow: "First-reply rehearsal",
        shortAnswerLabel: "The playable take",
        contentsLabel: "Rehearsal order",
        sectionLabel: "Take",
        faqEyebrow: "Production notes",
        faqHeading: "Questions before the next take",
        relatedHeading: "Continue the rehearsal",
        finalCtaEyebrow: "Ready for another take",
        finalCtaHeading: "Carry one playable reply into a story.",
        finalCtaBody: "Use the attributed route only when the story-led starting condition matches the experience you want.",
        backToTop: "Return to the slate",
      },
    },
  };
  const draft = {
    schemaVersion: 2,
    slug: "/first-reply-workbench",
    keyword: "ai roleplay first reply",
    title: "AI Roleplay First Reply: A Worked Example Lab",
    metaDescription: "Build an AI roleplay first reply from one detail, one modest action, and one hook, then repair only the beat that makes the scene stall.",
    h1: "Build a Playable First Reply",
    heroMarkdown: "A first response does not need to explain an entire character. It needs to change the immediate scene in one small, answerable way.",
    primaryCta: "Explore story-led roleplay on NovelAI",
    sections,
    faqs,
    architecture,
    signatureModule: {
      id: "notice-move-hook-workbench",
      type: "worked_example",
      title: "The marked first-reply take",
      intro: "Read one original reply as three separate beats, then identify which beat the next scene can answer.",
      items: [
        { label: "Notice", title: "Name the changed detail", bodyMarkdown: "Use one object, sound, absence, or interruption already available to the chosen point of view." },
        { label: "Move", title: "Act without resolving", bodyMarkdown: "Choose a modest physical or verbal action that changes the immediate pressure but leaves room for another turn." },
        { label: "Hook", title: "Leave one answerable gap", bodyMarkdown: "End with one uncertainty, choice, or consequence that the scene can respond to specifically." },
      ],
    },
  };
  const contentStrategy = {
    schemaVersion: 2,
    searcherJob,
    painPointId: "quality_repair",
    readerStateBefore: "The reader has a story and role but is staring at an empty first-response field.",
    readerOutcome: "The reader can draft and diagnose one concise first reply using three different scene jobs.",
    primaryPainPoint: "The first response feels vague or finished because its sentences do not create an answerable next beat.",
    oneSentenceAnswer,
    originalContribution,
    pagePattern: "task_guide",
    productBridge: "An existing plot and available role provide the context and perspective used by the worked example.",
    contextualNextStep: "A qualified reader can intentionally follow the attributed NovelAI route after building one reply.",
    evidenceBoundary: "Use only approved product facts and original abstract scene material with no availability or outcome claims.",
    conversionHypothesis: "A concrete worked example should reduce the blank-field barrier before an intentional product visit.",
    primaryConversion: "trial_start",
    measurementPlan: "Measure exact-page search, landing UV, attributed outbound, and protected downstream callbacks separately.",
  };
  const candidate = { decisionEvidence: { searcherJob } };
  return { draft, contentStrategy, candidate };
}

test("presentation recipes make visual and decoration policy explicit", () => {
  assert.equal(validatePresentationRecipeCatalog(presentationCatalog, architecturePolicy), presentationCatalog);
  assert.ok(presentationCatalog.recipes.some((recipe) => recipe.companion === "none"));
  assert.ok(presentationCatalog.recipes.some((recipe) => recipe.companion === "story_companion"));
  assert.ok(presentationCatalog.recipes.every((recipe) => recipe.gallery === "none"));
});

test("a schema-2 draft maps every content layer to its architecture", () => {
  const input = fixture();
  assert.doesNotThrow(() => validatePageArchitecture({
    ...input,
    pages: [],
    architecturePolicy,
    presentationCatalog,
  }));
  const novelty = analyzeContentNovelty({
    draft: input.draft,
    pages: [],
    architecturePolicy,
    presentationCatalog,
    allowedPhrases: productFacts.facts.map((fact) => fact.statement),
  });
  assert.equal(novelty.passed, true, JSON.stringify(novelty.violations));
});

test("section-layer drift and internal repetition are blocked independently", () => {
  const input = fixture();
  input.draft.sections[1].role = "exercise";
  assert.throws(() => validatePageArchitecture({
    ...input,
    pages: [],
    architecturePolicy,
    presentationCatalog,
  }), /does not match its architecture layer/);

  const repeated = fixture().draft;
  repeated.sections[1].bodyMarkdown = repeated.sections[0].bodyMarkdown;
  const novelty = analyzeContentNovelty({
    draft: repeated,
    pages: [],
    architecturePolicy,
    presentationCatalog,
  });
  assert.equal(novelty.passed, false);
  assert.ok(novelty.violations.some((item) => item.code === "internal-section-repetition"));
});

test("the previously accepted first-message page now fails the nearest-page differentiation gate", async () => {
  const today = await readJson("../data/pages/ai-roleplay-first-message.json");
  const previous = await readJson("../data/pages/how-to-start-ai-roleplay.json");
  const architectureFixture = fixture();
  const draft = {
    ...today,
    schemaVersion: 2,
    slug: `/${today.slug}`,
    architecture: architectureFixture.draft.architecture,
    signatureModule: architectureFixture.draft.signatureModule,
  };
  const novelty = analyzeContentNovelty({
    draft,
    pages: [previous],
    architecturePolicy,
    presentationCatalog,
    allowedPhrases: productFacts.facts.map((fact) => fact.statement),
  });
  assert.equal(novelty.passed, false);
  assert.ok(novelty.violations.some((item) =>
    item.code === "missing-nearest-page-difference" && item.slug === previous.slug),
  JSON.stringify(novelty.violations));
});

test("a single-use recipe and signature cannot silently become the next page template", () => {
  const input = fixture();
  const previous = {
    ...structuredClone(input.draft),
    schemaVersion: 3,
    slug: "previous-workbench",
    path: "/previous-workbench",
    status: "published",
    publishedAt: "2098-12-31T00:00:00.000Z",
  };
  input.draft.architecture.differentiation.against = [{
    slug: previous.slug,
    intentDelta: "The new page answers a later diagnostic task.",
    answerDelta: "The new page repairs a reply instead of only building one.",
    structureDelta: "The new page begins with failure analysis.",
    faqDelta: "The new FAQs resolve repair obstacles.",
    visualDelta: "The new page should use another registered visual world.",
  }];
  const novelty = analyzeContentNovelty({
    draft: input.draft,
    pages: [previous],
    architecturePolicy,
    presentationCatalog,
  });
  assert.equal(novelty.passed, false);
  assert.ok(novelty.violations.some((item) => item.code === "single-use-recipe"));
  assert.ok(novelty.violations.some((item) => item.code === "signature-id-reuse"));
});

test("published report history keeps single-use recipes and signature IDs retired after an update", () => {
  const input = fixture();
  const formerDraft = structuredClone(input.draft);
  formerDraft.slug = "/former-workbench";
  const reports = [{
    id: "seo-2098-12-30",
    generatedAt: "2098-12-30T01:00:00.000Z",
    publication: {
      status: "published",
      slug: "former-workbench",
      publishedAt: "2098-12-30T02:00:00.000Z",
      updatedAt: "2098-12-30T02:00:00.000Z",
    },
    draft: formerDraft,
  }];
  const history = publishedArchitectureHistoryFromReports(reports);
  const currentPage = {
    ...structuredClone(formerDraft),
    schemaVersion: 3,
    slug: "former-workbench",
    status: "published",
    publishedAt: "2098-12-30T02:00:00.000Z",
    updatedAt: "2099-01-02T02:00:00.000Z",
  };
  const replacement = presentationCatalog.recipes.find((recipe) => recipe.id === "nocturne-decision-grid-v1");
  Object.assign(currentPage.architecture.presentation, {
    recipeId: replacement.id,
    rendererId: replacement.rendererId,
    visualSystemId: replacement.visualSystemId,
    layoutId: replacement.layoutId,
    paletteId: replacement.paletteId,
    typographyId: replacement.typographyId,
    motifId: replacement.motifId,
    companion: replacement.companion,
    gallery: replacement.gallery,
  });
  currentPage.signatureModule.id = "replacement-route-switchboard";
  currentPage.signatureModule.type = "comparison";

  const novelty = analyzeContentNovelty({
    draft: input.draft,
    pages: [currentPage],
    architectureHistory: history,
    architecturePolicy,
    presentationCatalog,
  });
  assert.ok(novelty.violations.some((item) =>
    item.code === "single-use-recipe" && item.slug === "former-workbench"));
  assert.ok(novelty.violations.some((item) =>
    item.code === "signature-id-reuse" && item.slug === "former-workbench"));
});

test("an updated publication is the newest cooldown event even when its first publish date is old", () => {
  const input = fixture();
  const playful = presentationCatalog.recipes.find((recipe) => recipe.id === "playful-story-workshop-v1");
  Object.assign(input.draft.architecture.presentation, {
    recipeId: playful.id,
    rendererId: playful.rendererId,
    visualSystemId: playful.visualSystemId,
    layoutId: playful.layoutId,
    paletteId: playful.paletteId,
    typographyId: playful.typographyId,
    motifId: playful.motifId,
    companion: playful.companion,
    gallery: playful.gallery,
  });
  const updatedDraft = structuredClone(input.draft);
  updatedDraft.slug = "/updated-workshop";
  const reports = [{
    id: "seo-2100-01-01",
    generatedAt: "2090-01-01T01:00:00.000Z",
    publication: {
      status: "published",
      slug: "updated-workshop",
      publishedAt: "2090-01-01T02:00:00.000Z",
      updatedAt: "2100-01-01T03:00:00.000Z",
    },
    draft: updatedDraft,
  }];
  for (let index = 0; index < 6; index += 1) {
    const draft = structuredClone(input.draft);
    draft.slug = `/intervening-${index}`;
    draft.architecture.presentation.recipeId = `other-recipe-${index}`;
    draft.architecture.presentation.visualSystemId = `other-visual-${index}`;
    draft.architecture.presentation.layoutId = `other-layout-${index}`;
    draft.architecture.presentation.paletteId = `other-palette-${index}`;
    draft.signatureModule.id = `other-signature-${index}`;
    reports.push({
      id: `seo-2099-01-0${index + 1}`,
      generatedAt: `2099-01-0${index + 1}T01:00:00.000Z`,
      publication: {
        status: "published",
        slug: `intervening-${index}`,
        publishedAt: `2099-01-0${index + 1}T02:00:00.000Z`,
      },
      draft,
    });
  }
  const history = publishedArchitectureHistoryFromReports(reports);
  assert.equal(history.find((entry) => entry.slug === "updated-workshop")?.effectiveAt,
    "2100-01-01T03:00:00.000Z");
  const novelty = analyzeContentNovelty({
    draft: input.draft,
    pages: [],
    architectureHistory: history,
    architecturePolicy,
    presentationCatalog,
  });
  assert.ok(novelty.violations.some((item) =>
    item.code === "presentation-recipe-cooldown" && item.slug === "updated-workshop"));
});

test("policy thresholds fail closed and surface copy cannot pad unrendered words", () => {
  const missingThreshold = structuredClone(architecturePolicy);
  delete missingThreshold.novelty.maxH1Cosine;
  assert.throws(() => validateArchitecturePolicy(missingThreshold), /exactly the supported gate fields/);
  assert.throws(() => analyzeContentNovelty({
    draft: fixture().draft,
    pages: [],
    architecturePolicy: missingThreshold,
    presentationCatalog,
  }), /exactly the supported gate fields/);

  const padded = fixture();
  padded.draft.architecture.presentation.surfaceCopy.unrenderedEssay = "padding ".repeat(700);
  assert.throws(() => validatePageArchitecture({
    ...padded,
    pages: [],
    architecturePolicy,
    presentationCatalog,
  }), /complete page architecture contract|cannot contain unrendered padding fields/);
  assert.equal(visiblePageText(padded.draft).includes("padding padding"), false);

  const selfLinked = fixture().draft;
  selfLinked.path = selfLinked.slug;
  selfLinked.internalLinks = [{ anchor: "Self-link words must never count as rendered copy", href: selfLinked.slug }];
  assert.equal(visiblePageText(selfLinked).includes("Self-link words"), false);
  selfLinked.internalLinks = [
    { anchor: "The one rendered contextual anchor", href: "/another-page" },
    { anchor: "Duplicate-link padding must not count", href: "/another-page" },
  ];
  assert.equal(visiblePageText(selfLinked).includes("The one rendered contextual anchor"), true);
  assert.equal(visiblePageText(selfLinked).includes("Duplicate-link padding"), false);
});

test("the SEO schema bridge fails closed before runtime can fall back to a legacy renderer", () => {
  assert.doesNotThrow(() => validateSeoArchitectureBridge(seoPolicy, architecturePolicy));
  const drifted = structuredClone(seoPolicy);
  drifted.contentArchitecture.publishedPageSchemaVersion = 4;
  assert.throws(() => validateSeoArchitectureBridge(drifted, architecturePolicy), /published schema 3 only/);
  const wrongPath = structuredClone(seoPolicy);
  wrongPath.contentArchitecture.presentationRecipes = "data/config/other-recipes.json";
  assert.throws(() => validateSeoArchitectureBridge(wrongPath, architecturePolicy), /paths must match/);
});

test("title, H1, headings, FAQ questions, and surface labels have independent gates", () => {
  const input = fixture();
  const previous = {
    ...structuredClone(input.draft),
    schemaVersion: 3,
    slug: "previous-field-copy",
    path: "/previous-field-copy",
    status: "published",
    publishedAt: "2098-12-31T00:00:00.000Z",
    updatedAt: "2098-12-31T00:00:00.000Z",
  };
  input.draft.architecture.differentiation.against = [{
    slug: previous.slug,
    intentDelta: "This draft diagnoses a later exchange instead of explaining the initial setup decision.",
    answerDelta: "It repairs one failed beat with a targeted edit instead of offering the previous construction sequence.",
    structureDelta: "Failure evidence opens the answer before a repair lab and a deliberately narrow practice step.",
    faqDelta: "The questions resolve revision obstacles rather than the earlier route-selection uncertainties.",
    visualDelta: "The rendered treatment will use a separate registered layout, palette, motif, and typographic hierarchy.",
  }];
  const novelty = analyzeContentNovelty({
    draft: input.draft,
    pages: [previous],
    architecturePolicy,
    presentationCatalog,
  });
  for (const code of [
    "title-similarity",
    "h1-similarity",
    "section-heading-similarity",
    "faq-question-similarity",
    "surface-copy-similarity",
  ]) assert.ok(novelty.violations.some((item) => item.code === code), code);
});

test("recipe cooldown uses its full six-page window and updatedAt ordering", () => {
  const input = fixture();
  const playful = presentationCatalog.recipes.find((recipe) => recipe.id === "playful-story-workshop-v1");
  input.draft.architecture.presentation = {
    recipeId: playful.id,
    rendererId: playful.rendererId,
    visualSystemId: playful.visualSystemId,
    layoutId: playful.layoutId,
    paletteId: playful.paletteId,
    typographyId: playful.typographyId,
    motifId: playful.motifId,
    companion: playful.companion,
    gallery: playful.gallery,
    surfaceCopy: input.draft.architecture.presentation.surfaceCopy,
  };
  const pages = Array.from({ length: 6 }, (_, index) => ({
    schemaVersion: 3,
    slug: `cooldown-${index + 1}`,
    status: "published",
    title: `Independent reference ${index + 1}`,
    metaDescription: `A separate reference page about a different content operation number ${index + 1}.`,
    h1: `Independent Reference ${index + 1}`,
    heroMarkdown: `This page records unrelated evidence for operation ${index + 1}.`,
    primaryCta: `Continue operation ${index + 1}`,
    sections: [],
    faqs: [],
    publishedAt: `2099-01-0${6 - index}T00:00:00.000Z`,
    updatedAt: `2099-01-0${6 - index}T00:00:00.000Z`,
    architecture: {
      intent: { painPointId: `other-${index}` },
      content: { archetype: `other-${index}`, openingMove: `other-${index}`, sections: [], faqs: [] },
      presentation: {
        recipeId: index === 5 ? playful.id : `other-recipe-${index}`,
        visualSystemId: `other-visual-${index}`,
        layoutId: `other-layout-${index}`,
        paletteId: `other-palette-${index}`,
      },
    },
    signatureModule: { id: `other-signature-${index}`, type: `other-${index}` },
  }));
  const novelty = analyzeContentNovelty({
    draft: input.draft,
    pages,
    architecturePolicy,
    presentationCatalog,
  });
  assert.ok(novelty.violations.some((item) =>
    item.code === "presentation-recipe-cooldown" && item.slug === "cooldown-6"));

  pages[5].publishedAt = "2090-01-01T00:00:00.000Z";
  pages[5].updatedAt = "2100-01-01T00:00:00.000Z";
  const updatedNovelty = analyzeContentNovelty({
    draft: input.draft,
    pages,
    architecturePolicy,
    presentationCatalog,
  });
  assert.ok(updatedNovelty.violations.some((item) =>
    item.code === "presentation-recipe-cooldown" && item.slug === "cooldown-6"));
});

test("a genuinely different draft passes against the complete current corpus", async () => {
  const names = (await readdir(new URL("../data/pages/", import.meta.url))).filter((name) => name.endsWith(".json"));
  const pages = [];
  for (const name of names) {
    try {
      pages.push(await readJson(`../data/pages/${name}`));
    } catch {
      // A legacy artifact with broken historical encoding is not publishable corpus input.
    }
  }
  const input = fixture();
  const firstPass = analyzeContentNovelty({
    draft: input.draft,
    pages,
    architecturePolicy,
    presentationCatalog,
    allowedPhrases: productFacts.facts.map((fact) => fact.statement),
  });
  input.draft.architecture.differentiation.against = firstPass.nearest.slice(0, 2).map((entry) => ({
    slug: entry.slug,
    intentDelta: "This answer handles the first reply after context exists, not the earlier page's setup or product-choice task.",
    answerDelta: "It annotates three sentence-level jobs and a repair move instead of restating the previous starting sequence.",
    structureDelta: "A closed-versus-playable contrast leads into an example lab and targeted repair checklist.",
    faqDelta: "These questions remove response-length, dialogue, and example-boundary obstacles specific to the later task.",
    visualDelta: "The rehearsal slate uses marked beats and retakes rather than the compared page's legacy family treatment.",
  }));
  const audited = analyzeContentNovelty({
    draft: input.draft,
    pages,
    architecturePolicy,
    presentationCatalog,
    allowedPhrases: productFacts.facts.map((fact) => fact.statement),
  });
  assert.equal(audited.passed, true, JSON.stringify(audited.violations));
});

test("approved fact sentences may repeat without disabling other repetition gates", () => {
  const input = fixture();
  const approvedSentence = productFacts.facts[0].statement;
  input.draft.sections[0].bodyMarkdown += ` ${approvedSentence}`;
  const previous = {
    schemaVersion: 2,
    status: "published",
    slug: "approved-fact-reference",
    publishedAt: "2090-01-01T00:00:00.000Z",
    updatedAt: "2090-01-01T00:00:00.000Z",
    title: "A separate product format reference",
    metaDescription: "A narrow reference that records one approved product statement for a different reader decision.",
    h1: "Product Format Reference",
    heroMarkdown: approvedSentence,
    primaryCta: "Read the format reference",
    sections: [],
    faqs: [],
  };
  input.draft.architecture.differentiation.against = [{
    slug: previous.slug,
    intentDelta: "The draft solves a writing obstacle while the reference records a bounded product-format statement.",
    answerDelta: "The draft gives a three-beat response method rather than repeating the reference as its answer.",
    structureDelta: "The draft contains a worked lab and repair checklist instead of a single product statement.",
    faqDelta: "Its questions address response choices rather than definitions of the product format.",
    visualDelta: "A rehearsal slate replaces the reference page's plain legacy presentation family.",
  }];
  const novelty = analyzeContentNovelty({
    draft: input.draft,
    pages: [previous],
    architecturePolicy,
    presentationCatalog,
    allowedPhrases: productFacts.facts.map((fact) => fact.statement),
  });
  assert.equal(novelty.violations.some((item) => item.code === "repeated-sentence"), false);
});
