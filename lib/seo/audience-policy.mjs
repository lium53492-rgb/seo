function isValidCalendarDate(value) {
  const normalized = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === normalized;
}

function includesAny(value, terms) {
  const haystack = String(value || "").toLowerCase();
  return Array.isArray(terms) && terms.some((term) => {
    const normalizedTerm = String(term || "").trim().toLowerCase();
    if (!normalizedTerm) return false;
    const escapedTerm = normalizedTerm
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    return new RegExp(`(?:^|[^a-z0-9])${escapedTerm}(?=$|[^a-z0-9])`, "i").test(haystack);
  });
}

function requiredSignals(strategy) {
  if (Array.isArray(strategy?.requiredProductSignals)) return strategy.requiredProductSignals;
  return strategy?.requiredProductSignal ? [strategy.requiredProductSignal] : [];
}

function blockedChildDirectedPattern(strategy, visibleText) {
  const patterns = strategy?.blockedChildDirectedPatterns;
  if (!Array.isArray(patterns) || !patterns.length ||
    patterns.some((pattern) => typeof pattern !== "string" || !pattern.trim())) {
    throw new Error("audienceStrategy.blockedChildDirectedPatterns must be a non-empty pattern list");
  }
  try {
    return patterns.map((pattern) => new RegExp(pattern, "i"))
      .find((pattern) => pattern.test(String(visibleText || "")));
  } catch {
    throw new Error("audienceStrategy has an invalid child-directed content pattern");
  }
}

function enforcementState(strategy, reportDate, requireReportDate) {
  const enforcedFrom = String(strategy?.enforcedFromReportDate || "");
  if (!isValidCalendarDate(enforcedFrom)) {
    throw new Error("audienceStrategy.enforcedFromReportDate must be a valid YYYY-MM-DD date");
  }
  if (reportDate === undefined && !requireReportDate) {
    return { applies: true, invalidReportDate: false };
  }
  if (!isValidCalendarDate(reportDate)) {
    return { applies: true, invalidReportDate: true };
  }
  return {
    applies: String(reportDate) >= enforcedFrom,
    invalidReportDate: false,
  };
}

export function audienceCandidateBlockers(candidate, policy, { reportDate } = {}) {
  const strategy = policy?.audienceStrategy;
  if (!strategy) return [];
  const enforcement = enforcementState(strategy, reportDate, false);
  if (!enforcement.applies) return [];
  const blockers = [];
  if (enforcement.invalidReportDate) {
    blockers.push("D&D-first candidate gate requires a valid report date");
  }
  const selectedSignals = candidate?.decisionEvidence?.productSignals || [];
  for (const signal of requiredSignals(strategy)) {
    if (!selectedSignals.includes(signal)) {
      blockers.push(`primary audience requires product signal ${signal}`);
    }
  }
  const intent = `${candidate?.keyword || ""} ${candidate?.decisionEvidence?.searcherJob || ""}`;
  if (!includesAny(intent, strategy.requiredAudienceTerms)) {
    blockers.push("search intent does not name the D&D/tabletop audience");
  }
  if (!includesAny(intent, strategy.requiredJobTerms)) {
    blockers.push("search intent does not name a player or Game Master table job");
  }
  if (candidate?.decisionEvidence?.ipClass !== "original_generic") {
    blockers.push("D&D-first automation currently requires original tabletop-fantasy content");
  }
  return blockers;
}

export function audienceDraftBlockers({ policy, reportDate, keyword, h1, factIds, architecture, visibleText }) {
  const strategy = policy?.audienceStrategy;
  if (!strategy) return [];
  const enforcement = enforcementState(strategy, reportDate, true);
  if (!enforcement.applies) return [];
  const blockers = [];
  if (enforcement.invalidReportDate) {
    blockers.push("D&D-first draft gate requires a valid report date");
  }
  const selectedFacts = new Set(Array.isArray(factIds) ? factIds : []);
  for (const signal of requiredSignals(strategy)) {
    const factId = policy?.decisionEvidence?.productSignals?.[signal]?.factId;
    if (!factId || !selectedFacts.has(factId)) {
      blockers.push(`draft requires primary-audience fact ${factId || signal}`);
    }
  }
  const intent = `${keyword || ""} ${h1 || ""} ${architecture?.intent?.searcherJob || ""}`;
  if (!includesAny(intent, strategy.requiredAudienceTerms)) {
    blockers.push("draft does not name the D&D/tabletop audience");
  }
  if (!includesAny(intent, strategy.requiredJobTerms)) {
    blockers.push("draft does not name a concrete player or Game Master table job");
  }
  if (!(strategy.allowedPainPointIds || []).includes(architecture?.intent?.painPointId)) {
    blockers.push("draft does not solve an approved adult D&D player or Game Master pain point");
  }
  const sectionRoles = (architecture?.content?.sections || []).map((section) => section?.role);
  const missingRoles = (strategy.requiredSectionRoles || []).filter((role) => !sectionRoles.includes(role));
  if (missingRoles.length) {
    blockers.push(`draft is missing required table-ready content layers: ${missingRoles.join(", ")}`);
  } else {
    let previousIndex = -1;
    const ordered = (strategy.requiredSectionRoles || []).every((role) => {
      const nextIndex = sectionRoles.indexOf(role, previousIndex + 1);
      if (nextIndex < 0) return false;
      previousIndex = nextIndex;
      return true;
    });
    if (!ordered) {
      blockers.push(`draft core content layers must keep this order: ${strategy.requiredSectionRoles.join(", ")}`);
    }
  }
  const tone = architecture?.content?.tone;
  if (!includesAny(tone, strategy.requiredMaturityToneTerms)) {
    blockers.push("draft tone does not explicitly target an adult or mature audience");
  }
  if (!includesAny(tone, strategy.requiredTabletopToneTerms)) {
    blockers.push("draft tone does not explicitly target the tabletop campaign domain");
  }
  const childDirectedPattern = blockedChildDirectedPattern(strategy, visibleText);
  if (childDirectedPattern) {
    blockers.push(`visible content uses child-directed framing: ${childDirectedPattern.source}`);
  }
  return blockers;
}
