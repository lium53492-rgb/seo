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
  if (!isRecord(config) ||
    config.schemaVersion !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(config.enforcedFromReportDate || "")) ||
    !Number.isInteger(config.requiredDraftSchemaVersion) ||
    config.requiredDraftSchemaVersion < 1 ||
    config.requiredReviewCheckId !== "original-ip-boundary" ||
    !Array.isArray(patterns) ||
    patterns.length < 4 ||
    new Set(patterns).size !== patterns.length ||
    patterns.some((pattern) => typeof pattern !== "string" || !pattern.trim())) {
    throw new Error("SEO policy has an invalid original-only IP boundary contract");
  }
  try {
    return {
      ...config,
      compiledPatterns: patterns.map((pattern) => new RegExp(pattern, "i")),
    };
  } catch {
    throw new Error("SEO policy has an invalid third-party reference pattern");
  }
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
  return blockers;
}

export function assertOriginalIpBoundary(input) {
  const blockers = originalIpBoundaryBlockers(input);
  if (blockers.length) throw new Error(blockers.join("; "));
}
