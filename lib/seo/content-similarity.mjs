import { createHash } from "node:crypto";
import {
  RENDERED_SURFACE_COPY_FIELDS,
  renderedCopyFragments,
  servedContentDigest,
  visiblePageText,
} from "./served-content.mjs";
import {
  validateArchitecturePolicy,
  validatePresentationRecipeCatalog,
} from "./content-contract.mjs";

const ENGLISH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "because", "been", "before", "but", "by",
  "can", "could", "do", "does", "each", "for", "from", "had", "has", "have", "how", "if",
  "in", "into", "is", "it", "its", "may", "more", "most", "no", "not", "of", "on", "one",
  "only", "or", "other", "our", "out", "should", "so", "some", "than", "that", "the", "their",
  "then", "there", "these", "they", "this", "through", "to", "too", "use", "used", "using",
  "was", "we", "what", "when", "where", "which", "while", "who", "why", "will", "with", "without",
  "would", "you", "your",
]);

// These terms are expected on nearly every page in this narrow product
// corpus. Removing them only for whole-page ranking stops topical vocabulary
// from overwhelming actual answer-shape differences. Field and pair gates do
// not use this list, so duplicate titles, headings, and questions still fail.
const CORPUS_DOMAIN_TERMS = new Set([
  "ai", "character", "characters", "experience", "fiction", "interactive", "novelai", "page",
  "product", "reader", "role", "roles", "roleplay", "scene", "scenes", "story", "stories", "voice",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeContentText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~|]/g, " ")
    .replace(/&(?:nbsp|amp|quot|apos);/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9'?.!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawTokens(value) {
  return normalizeContentText(value).match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) ?? [];
}

function similarityTokens(value, domainFiltered = false) {
  const result = rawTokens(value).filter((token) =>
    !ENGLISH_STOPWORDS.has(token) && (!domainFiltered || !CORPUS_DOMAIN_TERMS.has(token))
  );
  return result.length ? result : rawTokens(value);
}

function cosineFromTokens(leftTokens, rightTokens) {
  const leftCounts = new Map();
  const rightCounts = new Map();
  for (const token of leftTokens) leftCounts.set(token, (leftCounts.get(token) || 0) + 1);
  for (const token of rightTokens) rightCounts.set(token, (rightCounts.get(token) || 0) + 1);
  if (!leftCounts.size || !rightCounts.size) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const count of leftCounts.values()) leftMagnitude += count * count;
  for (const count of rightCounts.values()) rightMagnitude += count * count;
  for (const [token, count] of leftCounts) dot += count * (rightCounts.get(token) || 0);
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function cosineSimilarity(left, right) {
  return cosineFromTokens(similarityTokens(left), similarityTokens(right));
}

function wholeTextCosine(left, right) {
  return cosineFromTokens(similarityTokens(left, true), similarityTokens(right, true));
}

function shingles(value, size = 5) {
  const words = rawTokens(value);
  const result = new Set();
  for (let index = 0; index <= words.length - size; index += 1) {
    result.add(words.slice(index, index + size).join(" "));
  }
  return result;
}

export function shingleContainment(left, right, size = 5) {
  const leftShingles = shingles(left, size);
  const rightShingles = shingles(right, size);
  if (!leftShingles.size || !rightShingles.size) return 0;
  let intersection = 0;
  for (const shingle of leftShingles) {
    if (rightShingles.has(shingle)) intersection += 1;
  }
  return intersection / Math.min(leftShingles.size, rightShingles.size);
}

export { renderedCopyFragments, visiblePageText };

function maxPairSimilarity(left, right, accessor) {
  let maximum = 0;
  for (const leftItem of left) {
    for (const rightItem of right) {
      maximum = Math.max(maximum, cosineSimilarity(accessor(leftItem), accessor(rightItem)));
    }
  }
  return maximum;
}

function countMatchedPairs(left, right, accessor, threshold) {
  let count = 0;
  for (const leftItem of left) {
    if (right.some((rightItem) => cosineSimilarity(accessor(leftItem), accessor(rightItem)) >= threshold)) {
      count += 1;
    }
  }
  return count;
}

function sentences(value, minimumWords) {
  return normalizeContentText(value)
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => rawTokens(sentence).length >= minimumWords);
}

function repeatedSentences(left, right, minimumWords, allowedPhrases) {
  const rightSentences = new Set(sentences(right, minimumWords));
  return [...new Set(sentences(left, minimumWords))]
    .filter((sentence) => rightSentences.has(sentence) && !allowedPhrases.has(sentence));
}

function internalRepeatedSentences(page, minimumWords, allowedPhrases) {
  const counts = new Map();
  for (const fragment of renderedCopyFragments(page)) {
    for (const sentence of new Set(sentences(fragment, minimumWords))) {
      if (!allowedPhrases.has(sentence)) counts.set(sentence, (counts.get(sentence) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([sentence]) => sentence);
}

function internalMaximum(items, accessor) {
  let maximum = 0;
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      maximum = Math.max(maximum, cosineSimilarity(accessor(items[left]), accessor(items[right])));
    }
  }
  return maximum;
}

function structureFingerprint(page) {
  const architecture = page?.architecture;
  if (!architecture) return null;
  return [
    architecture.content?.archetype,
    architecture.content?.openingMove,
    ...(architecture.content?.sections || []).map((section) => `${section.role}:${section.format}`),
    "faq",
    ...(architecture.content?.faqs || []).map((faq) => faq.job),
  ].join("|");
}

function structureSequence(page) {
  const architecture = page?.architecture;
  if (!architecture) return [];
  return [
    `open:${architecture.content?.openingMove || ""}`,
    ...(architecture.content?.sections || []).map((section) =>
      `section:${section?.role || ""}:${section?.format || ""}`),
    ...(architecture.content?.faqs || []).map((faq) => `faq:${faq?.job || ""}`),
  ];
}

export function sequenceSimilarity(left, right) {
  const leftItems = Array.isArray(left) ? left : [];
  const rightItems = Array.isArray(right) ? right : [];
  if (!leftItems.length || !rightItems.length) return 0;
  const previous = new Array(rightItems.length + 1).fill(0);
  for (let leftIndex = 0; leftIndex < leftItems.length; leftIndex += 1) {
    const current = new Array(rightItems.length + 1).fill(0);
    for (let rightIndex = 0; rightIndex < rightItems.length; rightIndex += 1) {
      current[rightIndex + 1] = leftItems[leftIndex] === rightItems[rightIndex]
        ? previous[rightIndex] + 1
        : Math.max(previous[rightIndex + 1], current[rightIndex]);
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
  }
  return previous[rightItems.length] / Math.max(leftItems.length, rightItems.length);
}

function surfaceCopyValues(page) {
  return RENDERED_SURFACE_COPY_FIELDS.map((field) => page?.architecture?.presentation?.surfaceCopy?.[field])
    .filter((value) => typeof value === "string");
}

function violation(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function normalizedSlug(value) {
  return String(value || "").replace(/^\//, "");
}

function effectiveAt(page) {
  return String(page?.effectiveAt || page?.updatedAt || page?.publishedAt || "");
}

export function analyzeContentNovelty({
  draft,
  pages = [],
  architecturePolicy,
  presentationCatalog,
  allowedPhrases = [],
  architectureHistory = [],
  enforceEnhancedNovelty = false,
}) {
  validateArchitecturePolicy(architecturePolicy);
  validatePresentationRecipeCatalog(presentationCatalog, architecturePolicy);
  const thresholds = architecturePolicy.novelty;
  const draftSlug = normalizedSlug(draft.slug);
  const corpus = pages.filter((page) => page.status === "published" && page.slug !== draftSlug);
  const historicalUsage = architectureHistory.filter((entry) =>
    normalizedSlug(entry?.slug) !== draftSlug && entry?.architecture && entry?.signatureModule);
  const usageByIdentity = new Map();
  for (const entry of [...corpus, ...historicalUsage]) {
    const identity = [
      normalizedSlug(entry.slug),
      effectiveAt(entry),
      entry.architecture?.presentation?.recipeId || "",
      entry.signatureModule?.id || "",
      structureFingerprint(entry) || "",
    ].join("|");
    if (!usageByIdentity.has(identity)) usageByIdentity.set(identity, entry);
  }
  const usageEvents = [...usageByIdentity.values()];
  const normalizedAllowedPhrases = new Set(allowedPhrases.flatMap((phrase) => sentences(phrase, 1)));
  const draftSections = Array.isArray(draft.sections) ? draft.sections : [];
  const draftSectionPlans = Array.isArray(draft.architecture?.content?.sections)
    ? draft.architecture.content.sections
    : [];
  const draftFaqs = Array.isArray(draft.faqs) ? draft.faqs : [];
  const comparisons = corpus.map((page) => {
    const pageSections = Array.isArray(page.sections) ? page.sections : [];
    const pageSectionPlans = Array.isArray(page.architecture?.content?.sections)
      ? page.architecture.content.sections
      : [];
    const pageFaqs = Array.isArray(page.faqs) ? page.faqs : [];
    const repeated = repeatedSentences(
      visiblePageText(draft),
      visiblePageText(page),
      thresholds.minimumRepeatedSentenceWords,
      normalizedAllowedPhrases,
    );
    const sectionText = (section, plans) => {
      const index = plans.owner.indexOf(section);
      return `${plans.items[index]?.readerQuestion || ""} ${section?.heading || ""} ${section?.bodyMarkdown || ""}`;
    };
    return {
      slug: page.slug,
      wholeTextCosine: wholeTextCosine(visiblePageText(draft), visiblePageText(page)),
      titleCosine: cosineSimilarity(draft.title, page.title),
      metaDescriptionCosine: cosineSimilarity(draft.metaDescription, page.metaDescription),
      h1Cosine: cosineSimilarity(draft.h1, page.h1),
      heroCosine: cosineSimilarity(draft.heroMarkdown, page.heroMarkdown),
      primaryCtaCosine: cosineSimilarity(draft.primaryCta, page.primaryCta),
      sectionRoleSequenceSimilarity: sequenceSimilarity(structureSequence(draft), structureSequence(page)),
      maxSectionHeadingCosine: maxPairSimilarity(draftSections, pageSections, (section) => section?.heading || ""),
      maxSectionPairCosine: maxPairSimilarity(
        draftSections,
        pageSections,
        (section) => draftSections.includes(section)
          ? sectionText(section, { owner: draftSections, items: draftSectionPlans })
          : sectionText(section, { owner: pageSections, items: pageSectionPlans }),
      ),
      maxFaqQuestionCosine: maxPairSimilarity(draftFaqs, pageFaqs, (faq) => faq?.question || ""),
      maxFaqPairCosine: maxPairSimilarity(
        draftFaqs,
        pageFaqs,
        (faq) => `${faq?.question || ""} ${faq?.answerMarkdown || ""}`,
      ),
      maxSurfaceCopyCosine: maxPairSimilarity(
        surfaceCopyValues(draft),
        surfaceCopyValues(page),
        (value) => value,
      ),
      matchedFaqPairs: countMatchedPairs(
        draftFaqs,
        pageFaqs,
        (faq) => `${faq?.question || ""} ${faq?.answerMarkdown || ""}`,
        thresholds.maxFaqPairCosine,
      ),
      fiveWordShingleContainment: shingleContainment(visiblePageText(draft), visiblePageText(page), 5),
      repeatedSentenceCount: repeated.length,
      repeatedSentences: repeated,
    };
  }).sort((left, right) => right.wholeTextCosine - left.wholeTextCosine);

  const violations = [];
  for (const comparison of comparisons) {
    const checks = [
      ["whole-text-similarity", "wholeTextCosine", thresholds.maxWholeTextCosine],
      ["title-similarity", "titleCosine", thresholds.maxTitleCosine],
      ["meta-description-similarity", "metaDescriptionCosine", thresholds.maxMetaDescriptionCosine],
      ["h1-similarity", "h1Cosine", thresholds.maxH1Cosine],
      ["hero-similarity", "heroCosine", thresholds.maxHeroCosine],
      ["section-heading-similarity", "maxSectionHeadingCosine", thresholds.maxSectionHeadingCosine],
      ["section-similarity", "maxSectionPairCosine", thresholds.maxSectionPairCosine],
      ["faq-question-similarity", "maxFaqQuestionCosine", thresholds.maxFaqQuestionCosine],
      ["faq-similarity", "maxFaqPairCosine", thresholds.maxFaqPairCosine],
      ["surface-copy-similarity", "maxSurfaceCopyCosine", thresholds.maxSurfaceCopyCosine],
      ["phrase-overlap", "fiveWordShingleContainment", thresholds.maxFiveWordShingleContainment],
    ];
    if (enforceEnhancedNovelty) {
      checks.push(
        ["primary-cta-similarity", "primaryCtaCosine", thresholds.maxPrimaryCtaCosine],
        ["structure-sequence-similarity", "sectionRoleSequenceSimilarity", thresholds.maxSectionRoleSequenceSimilarity],
      );
    }
    for (const [code, field, threshold] of checks) {
      if (comparison[field] >= threshold) {
        violations.push(violation(code,
          `${field} against /${comparison.slug} is ${comparison[field].toFixed(3)}; limit ${threshold.toFixed(3)}.`,
          { slug: comparison.slug, value: comparison[field], threshold }));
      }
    }
    if (comparison.matchedFaqPairs > thresholds.maxMatchedFaqPairs) {
      violations.push(violation("matched-faq-pairs",
        `${comparison.matchedFaqPairs} FAQs match /${comparison.slug}; limit ${thresholds.maxMatchedFaqPairs}.`,
        { slug: comparison.slug, value: comparison.matchedFaqPairs, threshold: thresholds.maxMatchedFaqPairs }));
    }
    if (comparison.repeatedSentenceCount > thresholds.maxRepeatedSentences) {
      violations.push(violation("repeated-sentence",
        `${comparison.repeatedSentenceCount} long sentence(s) repeat /${comparison.slug}.`,
        { slug: comparison.slug, value: comparison.repeatedSentenceCount, threshold: thresholds.maxRepeatedSentences }));
    }
  }

  const internalSectionCosine = internalMaximum(
    draftSections,
    (section) => `${section?.heading || ""} ${section?.bodyMarkdown || ""}`,
  );
  const internalFaqCosine = internalMaximum(
    draftFaqs,
    (faq) => `${faq?.question || ""} ${faq?.answerMarkdown || ""}`,
  );
  const internalRepeated = internalRepeatedSentences(
    draft,
    thresholds.minimumRepeatedSentenceWords,
    normalizedAllowedPhrases,
  );
  if (internalSectionCosine >= thresholds.maxInternalSectionCosine) {
    violations.push(violation("internal-section-repetition",
      `Two draft sections have cosine ${internalSectionCosine.toFixed(3)}; limit ${thresholds.maxInternalSectionCosine.toFixed(3)}.`,
      { value: internalSectionCosine, threshold: thresholds.maxInternalSectionCosine }));
  }
  if (internalFaqCosine >= thresholds.maxInternalFaqCosine) {
    violations.push(violation("internal-faq-repetition",
      `Two draft FAQs have cosine ${internalFaqCosine.toFixed(3)}; limit ${thresholds.maxInternalFaqCosine.toFixed(3)}.`,
      { value: internalFaqCosine, threshold: thresholds.maxInternalFaqCosine }));
  }
  if (internalRepeated.length > thresholds.maxRepeatedSentences) {
    violations.push(violation("internal-repeated-sentence",
      `${internalRepeated.length} long sentence(s) repeat inside the draft.`,
      { value: internalRepeated.length, threshold: thresholds.maxRepeatedSentences }));
  }

  const requiredDifferenceCount = Math.min(architecturePolicy.minimumDifferentiationPages, comparisons.length);
  const documentedDifferences = new Set(
    (draft.architecture?.differentiation?.against || []).map((entry) => entry.slug),
  );
  for (const comparison of comparisons.slice(0, requiredDifferenceCount)) {
    if (!documentedDifferences.has(comparison.slug)) {
      violations.push(violation("missing-nearest-page-difference",
        `Architecture must document how this answer differs from nearest page /${comparison.slug}.`,
        { slug: comparison.slug }));
    }
  }

  const pagesByRecency = [...usageEvents]
    .sort((left, right) => effectiveAt(right).localeCompare(effectiveAt(left)));
  const recentPages = pagesByRecency.slice(0, architecturePolicy.recentComparisonPages);
  const architecture = draft.architecture;
  const fingerprint = structureFingerprint(draft);
  if (fingerprint) {
    const match = recentPages.find((page) => structureFingerprint(page) === fingerprint);
    if (match) violations.push(violation("structure-fingerprint-reuse",
      `The opening, archetype, section-role sequence, formats, and FAQ jobs repeat /${match.slug}.`, { slug: match.slug }));
  }
  const archetypeMatch = pagesByRecency
    .slice(0, architecturePolicy.archetypeCooldownPages)
    .find((page) => page.architecture?.content?.archetype === architecture?.content?.archetype);
  if (archetypeMatch) violations.push(violation("archetype-cooldown",
    `Content archetype ${architecture.content.archetype} was used too recently on /${archetypeMatch.slug}.`,
    { slug: archetypeMatch.slug }));
  const openingMatch = pagesByRecency
    .slice(0, architecturePolicy.openingMoveCooldownPages)
    .find((page) => page.architecture?.content?.openingMove === architecture?.content?.openingMove);
  if (openingMatch) violations.push(violation("opening-move-cooldown",
    `Opening move ${architecture.content.openingMove} was used too recently on /${openingMatch.slug}.`,
    { slug: openingMatch.slug }));
  const painPointMatch = pagesByRecency
    .slice(0, architecturePolicy.painPointCooldownPages)
    .find((page) => page.architecture?.intent?.painPointId === architecture?.intent?.painPointId);
  if (painPointMatch) violations.push(violation("pain-point-cooldown",
    `Pain point ${architecture.intent.painPointId} was used too recently on /${painPointMatch.slug}.`,
    { slug: painPointMatch.slug }));

  const signatureId = draft.signatureModule?.id;
  const duplicateSignature = usageEvents.find((page) => page.signatureModule?.id === signatureId);
  if (signatureId && duplicateSignature) violations.push(violation("signature-id-reuse",
    `Signature module ${signatureId} already belongs to /${duplicateSignature.slug}.`, { slug: duplicateSignature.slug }));
  const signatureTypeMatch = pagesByRecency
    .slice(0, architecturePolicy.signatureTypeCooldownPages)
    .find((page) => page.signatureModule?.type === draft.signatureModule?.type);
  if (signatureTypeMatch) violations.push(violation("signature-type-cooldown",
    `Signature type ${draft.signatureModule.type} was used too recently on /${signatureTypeMatch.slug}.`,
    { slug: signatureTypeMatch.slug }));

  const recipeId = architecture?.presentation?.recipeId;
  const recipe = presentationCatalog.recipes.find((item) => item.id === recipeId);
  if (recipe?.reusePolicy?.kind === "single_use") {
    const previous = usageEvents.find((page) => page.architecture?.presentation?.recipeId === recipeId);
    if (previous) violations.push(violation("single-use-recipe",
      `Presentation recipe ${recipeId} is single-use and already belongs to /${previous.slug}.`, { slug: previous.slug }));
  } else if (recipe?.reusePolicy?.kind === "cooldown") {
    const previous = pagesByRecency
      .slice(0, recipe.reusePolicy.pages)
      .find((page) => page.architecture?.presentation?.recipeId === recipeId);
    if (previous) violations.push(violation("presentation-recipe-cooldown",
      `Presentation recipe ${recipeId} was used too recently on /${previous.slug}.`, { slug: previous.slug }));
  }
  const presentationMatch = pagesByRecency
    .slice(0, architecturePolicy.presentationCooldownPages)
    .find((page) => page.architecture?.presentation?.visualSystemId === architecture?.presentation?.visualSystemId ||
      page.architecture?.presentation?.layoutId === architecture?.presentation?.layoutId ||
      page.architecture?.presentation?.paletteId === architecture?.presentation?.paletteId);
  if (presentationMatch) violations.push(violation("presentation-system-cooldown",
    `A recent page /${presentationMatch.slug} reuses the visual system, layout grammar, or palette.`,
    { slug: presentationMatch.slug }));

  const corpusDigestPayload = corpus
    .map((page) => ({
      slug: page.slug,
      status: page.status,
      effectiveAt: effectiveAt(page),
      servedContentDigest: servedContentDigest(page),
      structureFingerprint: structureFingerprint(page),
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const historyDigestPayload = historicalUsage
    .map((entry) => ({
      slug: normalizedSlug(entry.slug),
      sourceReportId: String(entry.sourceReportId || ""),
      effectiveAt: effectiveAt(entry),
      recipeId: entry.architecture?.presentation?.recipeId || "",
      visualSystemId: entry.architecture?.presentation?.visualSystemId || "",
      layoutId: entry.architecture?.presentation?.layoutId || "",
      paletteId: entry.architecture?.presentation?.paletteId || "",
      structureFingerprint: structureFingerprint(entry),
      signatureId: entry.signatureModule?.id || "",
      signatureType: entry.signatureModule?.type || "",
    }))
    .sort((left, right) => `${left.slug}|${left.effectiveAt}`.localeCompare(`${right.slug}|${right.effectiveAt}`));
  const corpusDigest = createHash("sha256")
    .update(JSON.stringify({ pages: corpusDigestPayload, history: historyDigestPayload }))
    .digest("hex");
  return {
    schemaVersion: 1,
    passed: violations.length === 0,
    corpusDigest,
    nearest: comparisons.slice(0, architecturePolicy.recentComparisonPages),
    internal: {
      maxSectionPairCosine: internalSectionCosine,
      maxFaqPairCosine: internalFaqCosine,
      repeatedSentenceCount: internalRepeated.length,
    },
    violations,
  };
}
