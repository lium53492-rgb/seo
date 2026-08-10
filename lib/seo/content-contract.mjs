import { markdownSemanticBlockCount } from "./markdown-semantics.mjs";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function isStringArray(value, minimum = 0) {
  return Array.isArray(value) && value.length >= minimum && value.every((item) => isString(item));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function englishWordCount(value) {
  return (String(value || "").match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
}

function assertUniqueStringEnum(policy, field) {
  assert(isStringArray(policy[field], 1) && unique(policy[field]),
    `Content architecture policy ${field} must be a non-empty unique string list`);
}

export function validateArchitecturePolicy(policy) {
  assert(isRecord(policy) && policy.schemaVersion === 1,
    "Content architecture policy must use schemaVersion 1");
  for (const field of [
    "requiredDraftSchemaVersion",
    "recentComparisonPages",
    "minimumDifferentiationPages",
    "archetypeCooldownPages",
    "openingMoveCooldownPages",
    "painPointCooldownPages",
    "signatureTypeCooldownPages",
    "presentationCooldownPages",
    "minimumDistinctSectionRoles",
    "minimumDistinctFaqJobs",
    "minimumSectionBodyWords",
    "minimumFaqAnswerWords",
    "minimumSignatureItemWords",
  ]) {
    assert(Number.isInteger(policy[field]) && policy[field] > 0,
      `Content architecture policy ${field} must be a positive integer`);
  }
  assert(policy.recentComparisonPages >= policy.minimumDifferentiationPages,
    "recentComparisonPages must cover minimumDifferentiationPages");
  for (const field of [
    "painPointIds",
    "archetypes",
    "openingMoves",
    "sectionRoles",
    "sectionFormats",
    "faqJobs",
    "signatureTypes",
    "requiredReviewChecks",
  ]) assertUniqueStringEnum(policy, field);
  assert(Array.isArray(policy.requiredSurfaceCopyFields) &&
    policy.requiredSurfaceCopyFields.length === RENDERED_SURFACE_COPY_FIELDS.length &&
    policy.requiredSurfaceCopyFields.every((field, index) => field === RENDERED_SURFACE_COPY_FIELDS[index]),
  "requiredSurfaceCopyFields must exactly match the renderer-owned surface copy contract");
  assert(isRecord(policy.novelty) && exactKeys(policy.novelty, [
    ...NOVELTY_THRESHOLD_FIELDS,
    "maxMatchedFaqPairs",
    "maxRepeatedSentences",
    "minimumRepeatedSentenceWords",
  ]), "Content architecture novelty policy must contain exactly the supported gate fields");
  for (const field of NOVELTY_THRESHOLD_FIELDS) {
    assert(Number.isFinite(policy.novelty[field]) && policy.novelty[field] > 0 && policy.novelty[field] <= 1,
      `Content architecture novelty ${field} must be a finite value in (0, 1]`);
  }
  for (const field of ["maxMatchedFaqPairs", "maxRepeatedSentences"]) {
    assert(Number.isInteger(policy.novelty[field]) && policy.novelty[field] >= 0,
      `Content architecture novelty ${field} must be a non-negative integer`);
  }
  assert(Number.isInteger(policy.novelty.minimumRepeatedSentenceWords) &&
    policy.novelty.minimumRepeatedSentenceWords > 0,
  "minimumRepeatedSentenceWords must be a positive integer");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(String(policy.enhancedNoveltyEnforcedFromReportDate || "")) &&
    Number.isFinite(Date.parse(`${policy.enhancedNoveltyEnforcedFromReportDate}T00:00:00Z`)),
  "enhancedNoveltyEnforcedFromReportDate must be a valid date");
  return policy;
}

export function validateSeoArchitectureBridge(seoPolicy, architecturePolicy) {
  const bridge = seoPolicy?.contentArchitecture;
  assert(isRecord(bridge) && exactKeys(bridge, [
    "schemaVersion",
    "draftSchemaVersion",
    "publishedPageSchemaVersion",
    "enforcedFromReportDate",
    "architecturePolicy",
    "presentationRecipes",
    "legacyPageSchemas",
  ]), "SEO contentArchitecture bridge must contain exactly the supported fields");
  assert(bridge.schemaVersion === 1 && bridge.draftSchemaVersion === 2 &&
    bridge.publishedPageSchemaVersion === 3,
  "SEO contentArchitecture bridge supports draft schema 2 and published schema 3 only");
  assert(bridge.architecturePolicy === "data/config/content-architecture.json" &&
    bridge.presentationRecipes === "data/config/presentation-recipes.json",
  "SEO contentArchitecture bridge paths must match the loaded source-of-truth files");
  assert(Array.isArray(bridge.legacyPageSchemas) && bridge.legacyPageSchemas.length === 2 &&
    bridge.legacyPageSchemas[0] === 1 && bridge.legacyPageSchemas[1] === 2,
  "SEO contentArchitecture legacy schemas must be exactly [1, 2]");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(String(bridge.enforcedFromReportDate || "")) &&
    Number.isFinite(Date.parse(`${bridge.enforcedFromReportDate}T00:00:00Z`)),
  "SEO contentArchitecture enforcedFromReportDate must be a valid date");
  validateArchitecturePolicy(architecturePolicy);
  assert(architecturePolicy.requiredDraftSchemaVersion === bridge.draftSchemaVersion,
    "SEO policy and content architecture disagree on the required draft schema");
  return bridge;
}

export function resolvePresentationRecipe(catalog, recipeId) {
  if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.recipes)) {
    throw new Error("Presentation recipe catalog must use schemaVersion 1");
  }
  const recipe = catalog.recipes.find((item) => item?.id === recipeId);
  if (!recipe) throw new Error(`Unknown presentation recipe: ${recipeId || "<empty>"}`);
  return recipe;
}

export function validatePresentationRecipeCatalog(catalog, architecturePolicy) {
  validateArchitecturePolicy(architecturePolicy);
  assert(catalog?.schemaVersion === 1 && Array.isArray(catalog.recipes) && catalog.recipes.length > 0,
    "Presentation recipe catalog must contain recipes");
  const ids = catalog.recipes.map((recipe) => recipe?.id);
  assert(ids.every((id) => isString(id)) && unique(ids), "Presentation recipe IDs must be unique");
  const rendererIds = catalog.recipes.map((recipe) => recipe?.rendererId);
  assert(rendererIds.length === RENDERER_IDS.length && unique(rendererIds) &&
    rendererIds.every((id) => RENDERER_IDS.includes(id)),
  "Presentation recipes must map one-to-one to the implemented renderers");
  for (const recipe of catalog.recipes) {
    assert(isString(recipe.rendererId), `Presentation recipe ${recipe.id} needs rendererId`);
    assert(isStringArray(recipe.compatiblePagePatterns, 1), `Presentation recipe ${recipe.id} needs compatible page patterns`);
    assert(isStringArray(recipe.compatibleArchetypes, 1), `Presentation recipe ${recipe.id} needs compatible archetypes`);
    assert(recipe.compatibleArchetypes.every((item) => architecturePolicy.archetypes.includes(item)),
      `Presentation recipe ${recipe.id} uses an unknown archetype`);
    for (const field of ["visualSystemId", "layoutId", "paletteId", "typographyId", "motifId", "sectionMarkerStyle", "sectionFlow", "signature"]) {
      assert(isString(recipe[field]), `Presentation recipe ${recipe.id} needs ${field}`);
    }
    assert(isStringArray(recipe.domainConcepts, 5), `Presentation recipe ${recipe.id} needs five domain concepts`);
    assert(isStringArray(recipe.rejectedDefaults, 3), `Presentation recipe ${recipe.id} needs three rejected defaults`);
    assert(recipe.companion === "none" || recipe.companion === "story_companion",
      `Presentation recipe ${recipe.id} needs an explicit companion policy`);
    assert(recipe.gallery === "none",
      `Presentation recipe ${recipe.id} must keep gallery=none until a content-driven gallery contract exists`);
    assert(recipe.reusePolicy?.kind === "single_use" ||
      (recipe.reusePolicy?.kind === "cooldown" && Number.isInteger(recipe.reusePolicy.pages) && recipe.reusePolicy.pages > 0),
    `Presentation recipe ${recipe.id} needs a valid reuse policy`);
  }
  return catalog;
}

export function isPageArchitecture(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (!isRecord(value.intent) || !isString(value.intent.searcherJob) || !isString(value.intent.painPointId) ||
    !isString(value.intent.decisionToEnable) || !isString(value.intent.oneSentenceAnswer) ||
    !isStringArray(value.intent.nonGoals, 2)) return false;
  if (!isRecord(value.content) || !isString(value.content.archetype) ||
    !isString(value.content.thesis) || !isString(value.content.originalContribution) ||
    !isString(value.content.tone) || !isString(value.content.openingMove) ||
    !isStringArray(value.content.avoidPhrases, 3) || !Array.isArray(value.content.sections) ||
    !Array.isArray(value.content.faqs) || !isRecord(value.content.signature)) return false;
  if (!value.content.sections.every((section) => isRecord(section) && isString(section.id) &&
    isString(section.role) && isString(section.format) && isString(section.readerQuestion) &&
    isString(section.uniqueTakeaway))) return false;
  if (!value.content.faqs.every((faq) => isRecord(faq) && isString(faq.id) &&
    isString(faq.job) && isString(faq.readerObstacle) && isString(faq.answerBoundary))) return false;
  if (!isString(value.content.signature.id) || !isString(value.content.signature.type) ||
    !isString(value.content.signature.readerAction) || !isString(value.content.signature.afterSectionId)) return false;
  if (!isRecord(value.differentiation) || !Array.isArray(value.differentiation.against) ||
    !value.differentiation.against.every((entry) => isRecord(entry) && isString(entry.slug) &&
      isString(entry.intentDelta) && isString(entry.answerDelta) && isString(entry.structureDelta) &&
      isString(entry.faqDelta) && isString(entry.visualDelta))) return false;
  if (!isRecord(value.presentation) || !isString(value.presentation.recipeId) ||
    !isString(value.presentation.rendererId) || !isString(value.presentation.visualSystemId) ||
    !isString(value.presentation.layoutId) || !isString(value.presentation.paletteId) ||
    !isString(value.presentation.typographyId) || !isString(value.presentation.motifId) ||
    !exactKeys(value.presentation.surfaceCopy, RENDERED_SURFACE_COPY_FIELDS) ||
    !RENDERED_SURFACE_COPY_FIELDS.every((field) => isString(value.presentation.surfaceCopy[field], 3))) return false;
  return (value.presentation.companion === "none" || value.presentation.companion === "story_companion") &&
    value.presentation.gallery === "none";
}

export function validatePublishedPageArchitecture({ page, architecturePolicy, presentationCatalog }) {
  validateArchitecturePolicy(architecturePolicy);
  validatePresentationRecipeCatalog(presentationCatalog, architecturePolicy);
  const architecture = page?.architecture;
  assert(isPageArchitecture(architecture), "Published page needs a complete architecture contract");
  assert(architecturePolicy.painPointIds.includes(architecture.intent.painPointId),
    `Unknown published pain point ID: ${architecture.intent.painPointId}`);
  assert(isString(architecture.intent.decisionToEnable, 20) && isString(architecture.intent.oneSentenceAnswer, 20) &&
    architecture.intent.nonGoals.every((item) => isString(item, 10)),
  "Published architecture intent is not specific enough");
  assert(architecturePolicy.archetypes.includes(architecture.content.archetype) &&
    architecturePolicy.openingMoves.includes(architecture.content.openingMove),
  "Published architecture uses an unknown archetype or opening move");
  assert(isString(architecture.content.thesis, 20) && isString(architecture.content.originalContribution, 20) &&
    isString(architecture.content.tone, 20),
  "Published architecture needs a specific thesis, contribution, and tone");

  const sections = Array.isArray(page?.sections) ? page.sections : [];
  const sectionPlan = architecture.content.sections;
  assert(sections.length === sectionPlan.length && sectionPlan.length > 0,
    "Published sections must map one-to-one to their architecture");
  assert(unique(sectionPlan.map((section) => section.id)), "Published section IDs must be unique");
  for (let index = 0; index < sectionPlan.length; index += 1) {
    const planned = sectionPlan[index];
    const rendered = sections[index];
    assert(architecturePolicy.sectionRoles.includes(planned.role) &&
      architecturePolicy.sectionFormats.includes(planned.format),
    `Published section ${planned.id} uses an unknown role or format`);
    assert(isString(planned.readerQuestion, 10) && isString(planned.uniqueTakeaway, 20),
      `Published section ${planned.id} needs a specific question and takeaway`);
    assert(rendered?.id === planned.id && rendered?.role === planned.role && rendered?.format === planned.format,
      `Published section ${planned.id} drifted from its architecture`);
    assert(englishWordCount(rendered?.bodyMarkdown) >= architecturePolicy.minimumSectionBodyWords,
      `Published section ${planned.id} is too shallow`);
    if (["steps", "checklist", "examples", "comparison"].includes(planned.format)) {
      assert(markdownSemanticBlockCount(rendered?.bodyMarkdown) >= 2,
        `Published section ${planned.id} lacks semantic blocks`);
    }
  }
  assert(new Set(sectionPlan.map((section) => section.role)).size >= architecturePolicy.minimumDistinctSectionRoles,
    "Published page does not have enough distinct section roles");

  const faqs = Array.isArray(page?.faqs) ? page.faqs : [];
  const faqPlan = architecture.content.faqs;
  assert(faqs.length === faqPlan.length && faqPlan.length > 0,
    "Published FAQs must map one-to-one to their architecture");
  assert(unique(faqPlan.map((faq) => faq.id)), "Published FAQ IDs must be unique");
  for (let index = 0; index < faqPlan.length; index += 1) {
    const planned = faqPlan[index];
    const rendered = faqs[index];
    assert(architecturePolicy.faqJobs.includes(planned.job) &&
      isString(planned.readerObstacle, 20) && isString(planned.answerBoundary, 20),
    `Published FAQ ${planned.id} has an invalid job, obstacle, or boundary`);
    assert(rendered?.id === planned.id && rendered?.job === planned.job,
      `Published FAQ ${planned.id} drifted from its architecture`);
    assert(englishWordCount(rendered?.answerMarkdown) >= architecturePolicy.minimumFaqAnswerWords,
      `Published FAQ ${planned.id} is too shallow`);
  }
  assert(new Set(faqPlan.map((faq) => faq.job)).size >= architecturePolicy.minimumDistinctFaqJobs,
    "Published page does not have enough distinct FAQ jobs");

  const signaturePlan = architecture.content.signature;
  const signature = page?.signatureModule;
  assert(architecturePolicy.signatureTypes.includes(signaturePlan.type) &&
    sectionPlan.some((section) => section.id === signaturePlan.afterSectionId),
  "Published signature type or placement is invalid");
  assert(isRecord(signature) && signature.id === signaturePlan.id && signature.type === signaturePlan.type &&
    isString(signature.title, 5) && isString(signature.intro, 20) &&
    Array.isArray(signature.items) && signature.items.length >= 3 &&
    signature.items.every((item) => isRecord(item) && isString(item.label) && isString(item.title) &&
      isString(item.bodyMarkdown, 20) && englishWordCount(item.bodyMarkdown) >= architecturePolicy.minimumSignatureItemWords),
  "Published signature module is incomplete");

  const recipe = resolvePresentationRecipe(presentationCatalog, architecture.presentation.recipeId);
  assert(isString(page?.pagePattern) && recipe.compatiblePagePatterns.includes(page.pagePattern) &&
    recipe.compatibleArchetypes.includes(architecture.content.archetype),
  "Published presentation recipe is incompatible with the page");
  for (const field of ["rendererId", "visualSystemId", "layoutId", "paletteId", "typographyId", "motifId", "companion", "gallery"]) {
    assert(architecture.presentation[field] === recipe[field],
      `Published presentation ${field} drifted from recipe ${recipe.id}`);
  }
  assert(exactKeys(architecture.presentation.surfaceCopy, architecturePolicy.requiredSurfaceCopyFields),
    "Published surface copy has missing or unrendered fields");
  for (const field of architecturePolicy.requiredSurfaceCopyFields) {
    const maximumWords = field === "finalCtaBody" ? 60 : field === "finalCtaHeading" ? 24 : 16;
    assert(isString(architecture.presentation.surfaceCopy[field], 3) &&
      englishWordCount(architecture.presentation.surfaceCopy[field]) <= maximumWords,
    `Published surface copy ${field} violates its rendered limits`);
  }
  const renderedText = visiblePageText(page).toLowerCase();
  assert(!architecture.content.avoidPhrases.some((phrase) =>
    renderedText.includes(String(phrase).trim().toLowerCase())),
  "Published page uses an architecture avoid phrase");

  assert(architecture.differentiation.against.every((entry) =>
    ["intentDelta", "answerDelta", "structureDelta", "faqDelta", "visualDelta"]
      .every((field) => isString(entry[field], 20) && !VAGUE_DIFFERENTIATION.test(entry[field].trim()))),
  "Published differentiation contains a vague delta");

  const novelty = page?.quality?.novelty;
  const nearestThresholds = {
    wholeTextCosine: "maxWholeTextCosine",
    titleCosine: "maxTitleCosine",
    metaDescriptionCosine: "maxMetaDescriptionCosine",
    h1Cosine: "maxH1Cosine",
    heroCosine: "maxHeroCosine",
    maxSectionHeadingCosine: "maxSectionHeadingCosine",
    maxSectionPairCosine: "maxSectionPairCosine",
    maxFaqQuestionCosine: "maxFaqQuestionCosine",
    maxFaqPairCosine: "maxFaqPairCosine",
    maxSurfaceCopyCosine: "maxSurfaceCopyCosine",
    fiveWordShingleContainment: "maxFiveWordShingleContainment",
  };
  const reportDate = String(page?.generatedFromReport || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  const enhancedNoveltyRequired = reportDate >= architecturePolicy.enhancedNoveltyEnforcedFromReportDate;
  const validNearest = (entry) => isRecord(entry) && isString(entry.slug) &&
    Object.entries(nearestThresholds).every(([metric, threshold]) =>
      Number.isFinite(entry[metric]) && entry[metric] >= 0 && entry[metric] <= 1 &&
      entry[metric] < architecturePolicy.novelty[threshold]) &&
    (!enhancedNoveltyRequired || (
      Number.isFinite(entry.primaryCtaCosine) && entry.primaryCtaCosine >= 0 && entry.primaryCtaCosine <= 1 &&
      entry.primaryCtaCosine < architecturePolicy.novelty.maxPrimaryCtaCosine &&
      Number.isFinite(entry.sectionRoleSequenceSimilarity) && entry.sectionRoleSequenceSimilarity >= 0 &&
      entry.sectionRoleSequenceSimilarity <= 1 &&
      entry.sectionRoleSequenceSimilarity < architecturePolicy.novelty.maxSectionRoleSequenceSimilarity
    )) &&
    Number.isInteger(entry.matchedFaqPairs) && entry.matchedFaqPairs >= 0 &&
    entry.matchedFaqPairs <= architecturePolicy.novelty.maxMatchedFaqPairs &&
    Number.isInteger(entry.repeatedSentenceCount) && entry.repeatedSentenceCount >= 0 &&
    entry.repeatedSentenceCount <= architecturePolicy.novelty.maxRepeatedSentences &&
    Array.isArray(entry.repeatedSentences) &&
    entry.repeatedSentences.length === entry.repeatedSentenceCount &&
    entry.repeatedSentences.every((sentence) => isString(sentence));
  assert(isRecord(novelty) && novelty.schemaVersion === 1 && novelty.passed === true &&
    /^[a-f0-9]{64}$/.test(String(novelty.corpusDigest || "")) && Array.isArray(novelty.nearest) &&
    novelty.nearest.length <= architecturePolicy.recentComparisonPages &&
    new Set(novelty.nearest.map((entry) => entry?.slug)).size === novelty.nearest.length &&
    novelty.nearest.every(validNearest) &&
    isRecord(novelty.internal) &&
    Number.isFinite(novelty.internal.maxSectionPairCosine) &&
    novelty.internal.maxSectionPairCosine >= 0 && novelty.internal.maxSectionPairCosine <= 1 &&
    novelty.internal.maxSectionPairCosine < architecturePolicy.novelty.maxInternalSectionCosine &&
    Number.isFinite(novelty.internal.maxFaqPairCosine) &&
    novelty.internal.maxFaqPairCosine >= 0 && novelty.internal.maxFaqPairCosine <= 1 &&
    novelty.internal.maxFaqPairCosine < architecturePolicy.novelty.maxInternalFaqCosine &&
    Number.isInteger(novelty.internal.repeatedSentenceCount) && novelty.internal.repeatedSentenceCount >= 0 &&
    novelty.internal.repeatedSentenceCount <= architecturePolicy.novelty.maxRepeatedSentences &&
    Array.isArray(novelty.violations) && novelty.violations.length === 0,
  "Published novelty audit is incomplete or contradicts its passing status");
  const qualityChecks = Array.isArray(page?.quality?.checks) ? page.quality.checks : [];
  for (const checkId of ["content-contract", "content-distinctness", "presentation-distinctness", "optional-decoration"]) {
    const check = qualityChecks.find((item) => item?.id === checkId);
    assert(check?.passed === true && isString(check?.detail, 10),
      `Published quality audit is missing ${checkId}`);
  }
  return { architecture, recipe };
}

export function validatePageArchitecture({
  draft,
  contentStrategy,
  candidate,
  pages = [],
  architecturePolicy,
  presentationCatalog,
}) {
  validateArchitecturePolicy(architecturePolicy);
  assert(draft?.schemaVersion === architecturePolicy.requiredDraftSchemaVersion,
    `New drafts must use schemaVersion ${architecturePolicy.requiredDraftSchemaVersion}`);
  assert(contentStrategy?.schemaVersion === 2, "Content strategy must use schemaVersion 2");
  for (const field of ["readerStateBefore", "readerOutcome", "primaryPainPoint"]) {
    assert(isString(contentStrategy[field], 20), `Content strategy needs a specific ${field}`);
  }
  const architecture = draft.architecture;
  assert(isPageArchitecture(architecture), "Draft needs a complete page architecture contract");
  assert(isString(architecture.intent.decisionToEnable, 20) && isString(architecture.intent.oneSentenceAnswer, 20),
    "Architecture intent needs a specific decision and one-sentence answer");
  assert(architecture.intent.nonGoals.every((item) => isString(item, 10)),
    "Architecture non-goals must state meaningful exclusions");
  assert(isString(architecture.content.thesis, 20) && isString(architecture.content.originalContribution, 20) &&
    isString(architecture.content.tone, 20),
  "Architecture needs a specific thesis, original contribution, and tone");
  assert(architecturePolicy.archetypes.includes(architecture.content.archetype),
    `Unknown content archetype: ${architecture.content.archetype}`);
  assert(architecturePolicy.openingMoves.includes(architecture.content.openingMove),
    `Unknown opening move: ${architecture.content.openingMove}`);
  assert(architecturePolicy.painPointIds.includes(architecture.intent.painPointId),
    `Unknown pain point ID: ${architecture.intent.painPointId}`);
  assert(architecture.intent.painPointId === contentStrategy.painPointId,
    "Architecture painPointId must match contentStrategy.painPointId exactly");
  assert(architecture.intent.searcherJob === contentStrategy.searcherJob,
    "Architecture searcherJob must match contentStrategy.searcherJob exactly");
  assert(architecture.intent.oneSentenceAnswer === contentStrategy.oneSentenceAnswer,
    "Architecture oneSentenceAnswer must match contentStrategy.oneSentenceAnswer exactly");
  assert(architecture.content.originalContribution === contentStrategy.originalContribution,
    "Architecture originalContribution must match contentStrategy.originalContribution exactly");
  if (candidate?.decisionEvidence?.searcherJob) {
    assert(architecture.intent.searcherJob === candidate.decisionEvidence.searcherJob,
      "Architecture searcherJob must match the selected candidate decision evidence exactly");
  }

  const sectionPlan = architecture.content.sections;
  const faqPlan = architecture.content.faqs;
  assert(sectionPlan.length === draft.sections.length,
    "Architecture section plan must map one-to-one to draft sections");
  assert(faqPlan.length === draft.faqs.length,
    "Architecture FAQ plan must map one-to-one to draft FAQs");
  assert(unique(sectionPlan.map((section) => section.id)), "Architecture section IDs must be unique");
  assert(unique(faqPlan.map((faq) => faq.id)), "Architecture FAQ IDs must be unique");
  for (let index = 0; index < sectionPlan.length; index += 1) {
    const planned = sectionPlan[index];
    const rendered = draft.sections[index];
    assert(architecturePolicy.sectionRoles.includes(planned.role), `Unknown section role: ${planned.role}`);
    assert(architecturePolicy.sectionFormats.includes(planned.format), `Unknown section format: ${planned.format}`);
    assert(isString(planned.readerQuestion, 10) && isString(planned.uniqueTakeaway, 20),
      `Architecture section ${planned.id} needs a specific reader question and unique takeaway`);
    assert(rendered?.id === planned.id && rendered?.role === planned.role && rendered?.format === planned.format,
      `Draft section ${index + 1} does not match its architecture layer`);
    assert(englishWordCount(rendered?.bodyMarkdown) >= architecturePolicy.minimumSectionBodyWords,
      `Draft section ${planned.id} needs at least ${architecturePolicy.minimumSectionBodyWords} visible words`);
    if (["steps", "checklist", "examples", "comparison"].includes(planned.format)) {
      assert(markdownSemanticBlockCount(rendered?.bodyMarkdown) >= 2,
        `Draft section ${planned.id} needs at least two semantic blocks for ${planned.format} rendering`);
    }
  }
  const distinctRoles = new Set(sectionPlan.map((section) => section.role)).size;
  assert(distinctRoles >= architecturePolicy.minimumDistinctSectionRoles,
    `Draft needs at least ${architecturePolicy.minimumDistinctSectionRoles} distinct section roles`);
  for (let index = 0; index < faqPlan.length; index += 1) {
    const planned = faqPlan[index];
    const rendered = draft.faqs[index];
    assert(architecturePolicy.faqJobs.includes(planned.job), `Unknown FAQ job: ${planned.job}`);
    assert(isString(planned.readerObstacle, 20) && isString(planned.answerBoundary, 20),
      `Architecture FAQ ${planned.id} needs a specific obstacle and answer boundary`);
    assert(rendered?.id === planned.id && rendered?.job === planned.job,
      `Draft FAQ ${index + 1} does not match its architecture layer`);
    assert(englishWordCount(rendered?.answerMarkdown) >= architecturePolicy.minimumFaqAnswerWords,
      `Draft FAQ ${planned.id} needs at least ${architecturePolicy.minimumFaqAnswerWords} visible words`);
  }
  assert(new Set(faqPlan.map((faq) => faq.job)).size >= architecturePolicy.minimumDistinctFaqJobs,
    `Draft needs at least ${architecturePolicy.minimumDistinctFaqJobs} distinct FAQ jobs`);

  const signaturePlan = architecture.content.signature;
  const signature = draft.signatureModule;
  assert(architecturePolicy.signatureTypes.includes(signaturePlan.type),
    `Unknown signature module type: ${signaturePlan.type}`);
  assert(sectionPlan.some((section) => section.id === signaturePlan.afterSectionId),
    "Signature module placement must reference one architecture section ID");
  assert(isRecord(signature) && signature.id === signaturePlan.id && signature.type === signaturePlan.type,
    "Draft signature module must match the architecture contract");
  assert(isString(signature.title, 5) && isString(signature.intro, 20) && Array.isArray(signature.items) && signature.items.length >= 3,
    "Signature module needs a title, useful introduction, and at least three items");
  assert(signature.items.every((item) => isRecord(item) && isString(item.label) && isString(item.title) &&
    isString(item.bodyMarkdown, 20) && englishWordCount(item.bodyMarkdown) >= architecturePolicy.minimumSignatureItemWords),
    "Every signature module item needs a label, title, and useful body");

  validatePresentationRecipeCatalog(presentationCatalog, architecturePolicy);
  const recipe = resolvePresentationRecipe(presentationCatalog, architecture.presentation.recipeId);
  assert(recipe.compatiblePagePatterns.includes(contentStrategy.pagePattern),
    `Presentation recipe ${recipe.id} is incompatible with ${contentStrategy.pagePattern}`);
  assert(recipe.compatibleArchetypes.includes(architecture.content.archetype),
    `Presentation recipe ${recipe.id} is incompatible with ${architecture.content.archetype}`);
  for (const field of ["rendererId", "visualSystemId", "layoutId", "paletteId", "typographyId", "motifId", "companion", "gallery"]) {
    assert(architecture.presentation[field] === recipe[field],
      `Architecture presentation ${field} must match recipe ${recipe.id}`);
  }
  for (const field of architecturePolicy.requiredSurfaceCopyFields) {
    assert(isString(architecture.presentation.surfaceCopy[field], 3),
      `Architecture presentation needs page-specific surface copy: ${field}`);
    const maximumWords = field === "finalCtaBody" ? 60 : field === "finalCtaHeading" ? 24 : 16;
    assert(englishWordCount(architecture.presentation.surfaceCopy[field]) <= maximumWords,
      `Architecture surface copy ${field} exceeds its ${maximumWords}-word rendered limit`);
  }
  assert(exactKeys(architecture.presentation.surfaceCopy, architecturePolicy.requiredSurfaceCopyFields),
    "Architecture surface copy cannot contain unrendered padding fields");

  const renderedText = visiblePageText(draft).toLowerCase();
  const usedAvoidPhrase = architecture.content.avoidPhrases.find((phrase) =>
    renderedText.includes(String(phrase).trim().toLowerCase()));
  assert(!usedAvoidPhrase, `Draft uses a phrase its architecture explicitly forbids: ${usedAvoidPhrase}`);

  const publishedSlugs = new Set(pages.map((page) => page.slug));
  const against = architecture.differentiation.against;
  assert(unique(against.map((entry) => entry.slug)), "Differentiation slugs must be unique");
  assert(against.every((entry) => publishedSlugs.has(entry.slug)),
    "Differentiation entries must reference published pages");
  assert(against.every((entry) => ["intentDelta", "answerDelta", "structureDelta", "faqDelta", "visualDelta"]
    .every((field) => isString(entry[field], 20) && !VAGUE_DIFFERENTIATION.test(entry[field].trim()))),
  "Every differentiation entry needs specific intent, answer, structure, FAQ, and visual deltas");
  const requiredDifferences = Math.min(architecturePolicy.minimumDifferentiationPages, pages.length);
  assert(against.length >= requiredDifferences,
    `Architecture must explain its difference from at least ${requiredDifferences} published pages`);
  return { architecture, recipe };
}
import {
  RENDERED_SURFACE_COPY_FIELDS,
  visiblePageText,
} from "./served-content.mjs";

const RENDERER_IDS = Object.freeze([
  "rehearsal_slate",
  "nocturne_decision_grid",
  "product_field_manual",
  "editorial_argument",
  "specimen_catalog",
  "orbital_mission_log",
  "playful_story_workshop",
]);

const NOVELTY_THRESHOLD_FIELDS = Object.freeze([
  "maxWholeTextCosine",
  "maxTitleCosine",
  "maxMetaDescriptionCosine",
  "maxH1Cosine",
  "maxHeroCosine",
  "maxPrimaryCtaCosine",
  "maxSectionRoleSequenceSimilarity",
  "maxSectionHeadingCosine",
  "maxSectionPairCosine",
  "maxFaqQuestionCosine",
  "maxFaqPairCosine",
  "maxSurfaceCopyCosine",
  "maxFiveWordShingleContainment",
  "maxInternalSectionCosine",
  "maxInternalFaqCosine",
]);

const VAGUE_DIFFERENTIATION = /^(?:this |the )?(?:page |answer |content |structure |faq |visual )?(?:is |will be )?(?:different|distinct|unique|new|not the same)(?: from (?:the )?(?:other|previous|existing) page)?[.!]?$/i;
