export const clampScore = (value) =>
  Math.min(100, Math.max(0, Number(value) || 0));

const safeEvidenceId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const rationaleFields = [
  "demand",
  "difficulty",
  "productFit",
  "trialIntent",
  "revenueIntent",
  "intentSpecificity",
  "originality",
  "ipRisk",
  "cannibalizationRisk",
];

function requiredString(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`Every candidate needs ${field}`);
  return normalized;
}

function uniqueStringArray(value, field) {
  if (!Array.isArray(value)) throw new Error(`Every candidate needs ${field}`);
  const normalized = value.map((item) => requiredString(item, field));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${field} must not contain duplicates`);
  }
  return normalized;
}

function validateSignals(value, definitions, field) {
  const signals = uniqueStringArray(value, field);
  for (const signal of signals) {
    if (!Object.hasOwn(definitions, signal)) {
      throw new Error(`Unknown ${field} signal: ${signal}`);
    }
  }
  return signals;
}

function signalScore(signals, definitions) {
  return clampScore(signals.reduce((total, signal) => {
    const definition = definitions[signal];
    return total + Number(
      typeof definition === "object" ? definition.weight : definition,
    );
  }, 0));
}

function normalizeDecisionEvidence(raw, policy) {
  const rules = policy.decisionEvidence;
  if (!rules || Number(raw?.schemaVersion) !== Number(rules.schemaVersion)) {
    throw new Error(`Every candidate needs decisionEvidence schemaVersion ${rules?.schemaVersion ?? 1}`);
  }
  const evidenceRefs = uniqueStringArray(raw.evidenceRefs, "decisionEvidence.evidenceRefs");
  if (evidenceRefs.length < rules.minEvidenceRefs || evidenceRefs.some((id) => !safeEvidenceId.test(id))) {
    throw new Error(`decisionEvidence needs at least ${rules.minEvidenceRefs} safe evidenceRefs`);
  }
  const searcherJob = requiredString(raw.searcherJob, "decisionEvidence.searcherJob");
  if (searcherJob.length < rules.minSearcherJobChars) {
    throw new Error(`decisionEvidence.searcherJob needs at least ${rules.minSearcherJobChars} characters`);
  }
  const productFactIds = uniqueStringArray(raw.productFactIds, "decisionEvidence.productFactIds");
  const productSignals = validateSignals(raw.productSignals, rules.productSignals, "product");
  const trialSignals = validateSignals(raw.trialSignals, rules.trialSignals, "trial");
  const revenueSignals = validateSignals(raw.revenueSignals, rules.revenueSignals, "revenue");
  const specificitySignals = validateSignals(raw.specificitySignals, rules.specificitySignals, "specificity");
  for (const signal of productSignals) {
    const factId = rules.productSignals[signal].factId;
    if (!productFactIds.includes(factId)) {
      throw new Error(`Product signal ${signal} requires approved fact ID ${factId}`);
    }
  }
  const ipClass = requiredString(raw.ipClass, "decisionEvidence.ipClass");
  if (!Object.hasOwn(rules.ipClasses, ipClass)) {
    throw new Error(`Unknown IP class: ${ipClass}`);
  }
  const cannibalizationClass = requiredString(
    raw.cannibalizationClass,
    "decisionEvidence.cannibalizationClass",
  );
  if (!Object.hasOwn(rules.cannibalizationClasses, cannibalizationClass)) {
    throw new Error(`Unknown cannibalization class: ${cannibalizationClass}`);
  }
  const nearestExistingSlug = raw.nearestExistingSlug === null
    ? null
    : requiredString(raw.nearestExistingSlug, "decisionEvidence.nearestExistingSlug");
  if (nearestExistingSlug !== null && !safeSlug.test(nearestExistingSlug)) {
    throw new Error("decisionEvidence.nearestExistingSlug must be a safe slug or null");
  }
  if (cannibalizationClass === "new_intent" && nearestExistingSlug !== null) {
    throw new Error("new_intent must not name a nearestExistingSlug");
  }
  if (cannibalizationClass !== "new_intent" && nearestExistingSlug === null) {
    throw new Error(`${cannibalizationClass} needs nearestExistingSlug`);
  }
  const rationale = {};
  for (const field of rationaleFields) {
    const value = requiredString(raw.rationale?.[field], `decisionEvidence.rationale.${field}`);
    if (value.length < rules.minRationaleChars) {
      throw new Error(`decisionEvidence.rationale.${field} needs at least ${rules.minRationaleChars} characters`);
    }
    rationale[field] = value;
  }
  return {
    schemaVersion: rules.schemaVersion,
    evidenceRefs,
    searcherJob,
    productFactIds,
    productSignals,
    trialSignals,
    revenueSignals,
    specificitySignals,
    ipClass,
    cannibalizationClass,
    nearestExistingSlug,
    rationale,
  };
}

export function normalizeResearchCandidate(raw, policy) {
  const decisionEvidence = normalizeDecisionEvidence(raw.decisionEvidence, policy);
  const rules = policy.decisionEvidence;
  const cannibalization = rules.cannibalizationClasses[decisionEvidence.cannibalizationClass];
  const productFit = signalScore(decisionEvidence.productSignals, rules.productSignals);
  const trialIntent = signalScore(decisionEvidence.trialSignals, rules.trialSignals);
  const revenueIntent = signalScore(decisionEvidence.revenueSignals, rules.revenueSignals);
  const intentSpecificity = signalScore(
    decisionEvidence.specificitySignals,
    rules.specificitySignals,
  );
  return {
    keyword: requiredString(raw.keyword, "keyword").toLowerCase(),
    seed: requiredString(raw.seed, "seed").toLowerCase(),
    source: "codex_research",
    metricBasis: "research_proxy",
    scoreBasis: rules.scoreBasis,
    demandScore: clampScore(raw.demandScore),
    volume: 0,
    difficulty: clampScore(raw.difficulty),
    cpc: 0,
    intent: ["commercial", "informational", "navigational", "transactional", "mixed"].includes(raw.intent)
      ? raw.intent
      : "mixed",
    funnelStage: ["problem", "solution", "trial", "purchase"].includes(raw.funnelStage)
      ? raw.funnelStage
      : "problem",
    conversionGoal: ["qualified_outbound_click", "trial_start", "purchase"].includes(raw.conversionGoal)
      ? raw.conversionGoal
      : "qualified_outbound_click",
    trend: [],
    productFit,
    originality: clampScore(cannibalization.originality),
    conversionIntent: Math.max(trialIntent, revenueIntent),
    trialIntent,
    revenueIntent,
    intentSpecificity,
    ipRisk: clampScore(rules.ipClasses[decisionEvidence.ipClass]),
    cannibalizationRisk: clampScore(cannibalization.cannibalizationRisk),
    decisionEvidence,
    ...(raw.existingUrl ? { existingUrl: String(raw.existingUrl) } : {}),
  };
}

export function evaluatePublicationGates(candidate, policy) {
  const blockers = [];
  const gates = policy.hardGates;
  if (!policy.allowedSearchIntents.includes(candidate.intent)) {
    blockers.push(`search intent ${candidate.intent} is not trial-ready`);
  }
  if (!policy.eligibleFunnelStages.includes(candidate.funnelStage)) {
    blockers.push(`funnel stage ${candidate.funnelStage} is below trial intent`);
  }
  if (!policy.eligibleConversionGoals.includes(candidate.conversionGoal)) {
    blockers.push(`conversion goal ${candidate.conversionGoal} is not a trial or purchase goal`);
  }
  if (candidate.productFit < gates.minProductFit) blockers.push("product fit is below the gate");
  if (candidate.trialIntent < gates.minTrialIntent) blockers.push("trial intent is below the gate");
  if (candidate.revenueIntent < gates.minRevenueIntent) blockers.push("revenue intent is below the gate");
  if (candidate.intentSpecificity < gates.minIntentSpecificity) blockers.push("search intent is too broad");
  if (candidate.ipRisk > gates.maxIpRisk) blockers.push("IP risk exceeds the gate");
  if (candidate.cannibalizationRisk > gates.maxCannibalizationRisk) blockers.push("an existing page already owns this intent");
  return { passed: blockers.length === 0, blockers };
}

export function scoreResearchCandidate(raw, policy) {
  const candidate = normalizeResearchCandidate(raw, policy);
  const weights = policy.weights;
  const penalties = policy.penalties;
  const score = Math.round(clampScore(
    candidate.productFit * weights.productFit +
      candidate.trialIntent * weights.trialIntent +
      candidate.revenueIntent * weights.revenueIntent +
      candidate.intentSpecificity * weights.intentSpecificity +
      candidate.demandScore * weights.demand +
      (100 - candidate.difficulty) * weights.competitionEase +
      candidate.originality * weights.originality -
      candidate.ipRisk * penalties.ipRisk -
      candidate.cannibalizationRisk * penalties.cannibalizationRisk,
  ));
  const gate = evaluatePublicationGates(candidate, policy);
  const action = candidate.cannibalizationRisk > policy.hardGates.maxCannibalizationRisk
    ? "consolidate"
    : candidate.existingUrl
      ? gate.passed && score >= policy.improvePageThreshold ? "improve_page" : "observe"
      : gate.passed && score >= policy.createPageThreshold ? "create_page" : "observe";
  const strengths = [];
  if (candidate.trialIntent >= 80) strengths.push("strong trial intent");
  if (candidate.revenueIntent >= 70) strengths.push("meaningful payment intent");
  if (candidate.intentSpecificity >= 80) strengths.push("specific searcher job");
  if (candidate.productFit >= 90) strengths.push("strong approved-product fit");
  if (candidate.difficulty <= 35) strengths.push("lower competition proxy");
  const reason = gate.passed
    ? `${strengths.slice(0, 3).join("; ") || "all publication gates passed"}; evidence-derived revenue-first opportunity score ${score}.`
    : `Blocked: ${gate.blockers.join("; ")}; evidence-derived revenue-first opportunity score ${score}.`;
  return { ...candidate, score, action, gate, reason };
}
