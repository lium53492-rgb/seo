const requiredContractKeys = [
  "schemaVersion",
  "contentBasis",
  "dndReferenceScope",
  "srdMaterialUsed",
  "thirdPartyNames",
];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatedPolicy(policy) {
  const config = policy?.ipBoundary;
  const patterns = config?.thirdPartyReferencePatterns;
  const claimPatterns = config?.prohibitedClaimPatterns;
  const notice = config?.independenceNotice;
  if (!isRecord(config) ||
    config.schemaVersion !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(config.enforcedFromReportDate || "")) ||
    !Number.isInteger(config.requiredDraftSchemaVersion) ||
    config.requiredDraftSchemaVersion < 1 ||
    config.requiredReviewCheckId !== "original-ip-boundary" ||
    !Array.isArray(patterns) ||
    patterns.length < 4 ||
    new Set(patterns).size !== patterns.length ||
    patterns.some((pattern) => typeof pattern !== "string" || !pattern.trim()) ||
    !Array.isArray(claimPatterns) ||
    claimPatterns.length < 6 ||
    new Set(claimPatterns).size !== claimPatterns.length ||
    claimPatterns.some((pattern) => typeof pattern !== "string" || !pattern.trim()) ||
    !isRecord(notice) ||
    notice.schemaVersion !== 1 ||
    typeof notice.heading !== "string" || !notice.heading.trim() ||
    typeof notice.body !== "string" || !notice.body.trim() ||
    notice.srdMaterialUsed !== false) {
    throw new Error("SEO policy has an invalid original-only IP boundary contract");
  }
  try {
    return {
      ...config,
      compiledPatterns: patterns.map((pattern) => new RegExp(pattern, "i")),
      compiledClaimPatterns: claimPatterns.map((pattern) => new RegExp(pattern, "i")),
    };
  } catch {
    throw new Error("SEO policy has an invalid third-party reference pattern");
  }
}

function isNegatedOrQuestion(text, matchIndex) {
  const priorBoundaries = [".", "!", "?", "\n"].map((token) => text.lastIndexOf(token, matchIndex - 1));
  const sentenceStart = Math.max(...priorBoundaries) + 1;
  const prefix = text.slice(Math.max(sentenceStart, matchIndex - 120), matchIndex);
  if (/\b(?:not|never|without|no|does\s+not|do\s+not|is\s+not|are\s+not|cannot|can't|isn't|aren't)\b[^.!?\n]{0,110}$/i.test(prefix)) {
    return true;
  }

  const remainder = text.slice(sentenceStart);
  const sentenceEnd = remainder.search(/[.!?\n]/);
  const sentence = sentenceEnd === -1 ? remainder : remainder.slice(0, sentenceEnd + 1);
  const isQuestion = sentence.endsWith("?") &&
    /^(?:is|are|was|were|do|does|can|could|will|would|should|what|why|how|who)\b/i.test(sentence.trim());
  if (!isQuestion) return false;

  const questionEnd = sentenceStart + sentence.length;
  const followingAnswer = text.slice(questionEnd, questionEnd + 160).trim();
  const startsWithDenial = /^(?:no\b|not\b|it\s+is\s+not\b|they\s+are\s+not\b|we\s+are\s+not\b|playworlds\s+is\s+not\b|this\s+(?:is|site\s+is|guide\s+is|product\s+is|game\s+is|experience\s+is)\s+not\b)/i
    .test(followingAnswer);
  if (startsWithDenial) return true;
  const startsWithAffirmation = /^(?:(?:the\s+answer\s+is|in\s+this\s+case|for\s+playworlds)\s*[:,]?\s*)?(?:yes\b|correct\b|indeed\b|absolutely\b|certainly\b)|^(?:it|that|they|we|playworlds|this(?:\s+(?:site|guide|product|game|experience))?)\s+(?:(?:absolutely|certainly|indeed|officially)\s+)?(?:is|are)\b/i
    .test(followingAnswer);
  return !startsWithAffirmation;
}

function firstProhibitedClaim(patterns, visibleText) {
  for (const pattern of patterns) {
    const scanner = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
    for (let match = scanner.exec(visibleText); match; match = scanner.exec(visibleText)) {
      if (!isNegatedOrQuestion(visibleText, match.index)) return pattern;
      if (match[0].length === 0) scanner.lastIndex += 1;
    }
  }
  return null;
}

export function originalIpBoundaryBlockers(input) {
  const config = validatedPolicy(input.policy);
  const reportDate = String(input.reportDate || "");
  const currentDraft = input.draftSchemaVersion === config.requiredDraftSchemaVersion;
  if (!currentDraft) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return ["Original-only IP enforcement needs an exact report date"];
  }
  if (reportDate < config.enforcedFromReportDate) return [];

  const blockers = [];
  const contract = input.ipBoundary;
  if (!isRecord(contract) ||
    Object.keys(contract).length !== requiredContractKeys.length ||
    requiredContractKeys.some((key) => !Object.hasOwn(contract, key)) ||
    contract.schemaVersion !== 1 ||
    contract.contentBasis !== "original_tabletop_fantasy" ||
    contract.dndReferenceScope !== "audience_reference_only" ||
    contract.srdMaterialUsed !== false ||
    !Array.isArray(contract.thirdPartyNames) ||
    contract.thirdPartyNames.length !== 0) {
    blockers.push(
      "Draft must carry the exact original-only ipBoundary contract with no SRD material or third-party names",
    );
  }

  const visibleText = String(input.visibleText || "");
  const matchedPattern = config.compiledPatterns.find((pattern) => pattern.test(visibleText));
  if (matchedPattern) {
    blockers.push(`Visible content contains a blocked third-party reference: ${matchedPattern.source}`);
  }
  const matchedClaimPattern = firstProhibitedClaim(config.compiledClaimPatterns, visibleText);
  if (matchedClaimPattern) {
    blockers.push(`Visible content implies a prohibited D&D affiliation or compatibility claim: ${matchedClaimPattern.source}`);
  }
  return blockers;
}

export function assertOriginalIpBoundary(input) {
  const blockers = originalIpBoundaryBlockers(input);
  if (blockers.length) throw new Error(blockers.join("; "));
}
