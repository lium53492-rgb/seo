const REQUIRED_PRIMARY_METRICS = [
  "search_console_impressions",
  "search_console_clicks",
  "search_console_ctr",
  "search_console_average_position",
];

const REQUIRED_SUPPORTING_METRICS = [
  "landing_uv",
  "qualified_outbound_clicks",
];

function requiredBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new Error(`SEO measurement policy needs boolean ${field}`);
  }
  return value;
}

function requiredUniqueStrings(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`SEO measurement policy needs ${field}`);
  }
  const normalized = value.map((item) => String(item || "").trim());
  if (normalized.some((item) => !item) || new Set(normalized).size !== normalized.length) {
    throw new Error(`SEO measurement policy needs unique non-empty ${field}`);
  }
  return normalized;
}

export function readMeasurementPhase(policy) {
  const phase = policy?.measurementPhase;
  if (
    phase?.schemaVersion !== 1 ||
    phase?.id !== "early_traffic_validation"
  ) {
    throw new Error("SEO measurement policy needs the early_traffic_validation schema-v1 phase");
  }
  const primaryMetrics = requiredUniqueStrings(
    phase.primaryMetrics,
    "measurementPhase.primaryMetrics",
  );
  const supportingMetrics = requiredUniqueStrings(
    phase.supportingMetrics,
    "measurementPhase.supportingMetrics",
  );
  for (const metric of REQUIRED_PRIMARY_METRICS) {
    if (!primaryMetrics.includes(metric)) {
      throw new Error(`SEO measurement policy is missing primary metric ${metric}`);
    }
  }
  for (const metric of REQUIRED_SUPPORTING_METRICS) {
    if (!supportingMetrics.includes(metric)) {
      throw new Error(`SEO measurement policy is missing supporting metric ${metric}`);
    }
  }
  const publicationGate = phase.publicationGate;
  if (!publicationGate || typeof publicationGate !== "object" || Array.isArray(publicationGate)) {
    throw new Error("SEO measurement policy needs measurementPhase.publicationGate");
  }
  return {
    schemaVersion: 1,
    id: phase.id,
    primaryMetrics,
    supportingMetrics,
    optionalDownstreamMetrics: requiredUniqueStrings(
      phase.optionalDownstreamMetrics,
      "measurementPhase.optionalDownstreamMetrics",
    ),
    publicationGate: {
      requireCompletePublishedPageCoverage: requiredBoolean(
        publicationGate.requireCompletePublishedPageCoverage,
        "measurementPhase.publicationGate.requireCompletePublishedPageCoverage",
      ),
      requireObservedSearchConsoleForEveryPublishedPage: requiredBoolean(
        publicationGate.requireObservedSearchConsoleForEveryPublishedPage,
        "measurementPhase.publicationGate.requireObservedSearchConsoleForEveryPublishedPage",
      ),
      requireObservedLandingUvForEveryPublishedPage: requiredBoolean(
        publicationGate.requireObservedLandingUvForEveryPublishedPage,
        "measurementPhase.publicationGate.requireObservedLandingUvForEveryPublishedPage",
      ),
      requireObservedQualifiedOutboundForEveryPublishedPage: requiredBoolean(
        publicationGate.requireObservedQualifiedOutboundForEveryPublishedPage,
        "measurementPhase.publicationGate.requireObservedQualifiedOutboundForEveryPublishedPage",
      ),
      requireAttributionJoinReady: requiredBoolean(
        publicationGate.requireAttributionJoinReady,
        "measurementPhase.publicationGate.requireAttributionJoinReady",
      ),
      blockOnOrphanCallbacks: requiredBoolean(
        publicationGate.blockOnOrphanCallbacks,
        "measurementPhase.publicationGate.blockOnOrphanCallbacks",
      ),
      requireRevenueOutcomes: requiredBoolean(
        publicationGate.requireRevenueOutcomes,
        "measurementPhase.publicationGate.requireRevenueOutcomes",
      ),
    },
  };
}

export function evaluateCreatePageMeasurementReadiness({
  portfolio,
  policy,
  unattendedPolicy,
}) {
  if (unattendedPolicy?.allowCreatePageWhenMetricsUnavailable !== false) {
    throw new Error(
      "Create-page measurement gate requires allowCreatePageWhenMetricsUnavailable=false",
    );
  }
  const phase = readMeasurementPhase(policy);
  const gate = phase.publicationGate;
  const summary = portfolio?.summary;
  const entries = Array.isArray(portfolio?.entries) ? portfolio.entries : [];
  const failures = [];

  if (!summary || typeof summary !== "object") {
    failures.push("portfolio summary is missing");
  } else {
    if (gate.requireCompletePublishedPageCoverage && (
      summary.collectedPages !== summary.publishedPages ||
      summary.unavailablePages !== 0 ||
      entries.length !== summary.publishedPages
    )) {
      failures.push("the published-page portfolio is incomplete");
    }
    if (gate.requireAttributionJoinReady && summary.attributionJoinReady !== true) {
      failures.push("downstream attribution is not ready");
    }
    if (gate.blockOnOrphanCallbacks && summary.attributionJoinBlocked === true) {
      failures.push("an orphan callback blocks the attribution join");
    }
  }

  const failedSlugs = [];
  for (const entry of entries) {
    const pageFailures = [];
    if (entry?.state !== "collected") {
      pageFailures.push("page evidence is unavailable");
    } else {
      const decisionState = entry.report?.decisionState;
      if (
        gate.requireObservedSearchConsoleForEveryPublishedPage &&
        decisionState?.searchPerformanceReady !== true
      ) {
        pageFailures.push("Search Console evidence is unavailable");
      }
      if (
        gate.requireObservedLandingUvForEveryPublishedPage &&
        decisionState?.landingUvReady !== true
      ) {
        pageFailures.push("landing UV is unavailable");
      }
      if (
        gate.requireObservedQualifiedOutboundForEveryPublishedPage &&
        decisionState?.qualifiedOutboundReady !== true
      ) {
        pageFailures.push("qualified outbound clicks are unavailable");
      }
    }
    if (pageFailures.length) {
      const slug = entry?.sourceSlug || "<unknown>";
      failedSlugs.push(slug);
      failures.push(`${slug}: ${pageFailures.join(", ")}`);
    }
  }

  return {
    schemaVersion: phase.schemaVersion,
    phase: phase.id,
    ready: failures.length === 0,
    primaryMetrics: phase.primaryMetrics,
    supportingMetrics: phase.supportingMetrics,
    optionalDownstreamMetrics: phase.optionalDownstreamMetrics,
    failedSlugs,
    failures,
  };
}

export function assertCreatePageMeasurementReadiness(input) {
  const result = evaluateCreatePageMeasurementReadiness(input);
  if (!result.ready) {
    throw new Error(
      "Create-page early traffic measurement gate failed: every published page needs " +
      "observed exact-page Search Console impressions, clicks, CTR, and average-position evidence " +
      `(observed zero is allowed). Landing UV, qualified outbound clicks, callbacks, and revenue ` +
      `remain visible supporting signals but do not block this phase. Failures: ${result.failures.join("; ")}`,
    );
  }
  return result;
}

export function evaluateTrafficValidationProbe(readiness, policy) {
  const phase = readMeasurementPhase(policy);
  const probe = readiness?.probe;
  const probeObserved = Boolean(
    probe &&
    typeof probe === "object" &&
    !("state" in probe) &&
    probe.searchConsole?.state === "observed",
  );
  const searchConsoleConfigured = readiness?.sources?.searchConsole?.configured === true;
  return {
    schemaVersion: phase.schemaVersion,
    phase: phase.id,
    ready: searchConsoleConfigured && probeObserved,
    searchConsoleConfigured,
    exactPageSearchConsoleObserved: probeObserved,
    callbackOrRevenueRequired: phase.publicationGate.requireAttributionJoinReady ||
      phase.publicationGate.requireRevenueOutcomes,
  };
}
