export const clampScore = (value) =>
  Math.min(100, Math.max(0, Number(value) || 0));

function requiredString(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`Every candidate needs ${field}`);
  return normalized;
}

export function normalizeResearchCandidate(raw) {
  return {
    keyword: requiredString(raw.keyword, "keyword").toLowerCase(),
    seed: requiredString(raw.seed, "seed").toLowerCase(),
    source: "codex_research",
    metricBasis: "research_proxy",
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
    productFit: clampScore(raw.productFit),
    originality: clampScore(raw.originality),
    conversionIntent: clampScore(raw.conversionIntent ?? raw.trialIntent),
    trialIntent: clampScore(raw.trialIntent),
    revenueIntent: clampScore(raw.revenueIntent),
    intentSpecificity: clampScore(raw.intentSpecificity),
    ipRisk: clampScore(raw.ipRisk),
    cannibalizationRisk: clampScore(raw.cannibalizationRisk),
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
  const candidate = normalizeResearchCandidate(raw);
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
    ? `${strengths.slice(0, 3).join("; ") || "all publication gates passed"}; revenue-first opportunity score ${score}.`
    : `Blocked: ${gate.blockers.join("; ")}; revenue-first opportunity score ${score}.`;
  return { ...candidate, score, action, gate, reason };
}
