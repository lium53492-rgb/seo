import { canonicalSiteOrigin } from "./site-origin.mjs";

const dayMs = 86_400_000;
const shanghaiOffsetMs = 8 * 60 * 60 * 1_000;

function shanghaiDayStart(value) {
  return Math.floor((value + shanghaiOffsetMs) / dayMs) * dayMs - shanghaiOffsetMs;
}

export function completeShanghaiWindow(days, now = new Date(), reportingLagDays = 3) {
  if (!Number.isInteger(days) || days < 1 || days > 93) {
    throw new Error("Growth portfolio window must contain 1 to 93 complete Shanghai days");
  }
  if (!Number.isInteger(reportingLagDays) || reportingLagDays < 0 || reportingLagDays > 14) {
    throw new Error("Growth portfolio reporting lag must contain 0 to 14 complete Shanghai days");
  }
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(current)) throw new Error("Growth portfolio reference time is invalid");
  const periodEnd = shanghaiDayStart(current) - reportingLagDays * dayMs;
  return {
    periodStart: new Date(periodEnd - days * dayMs).toISOString(),
    periodEnd: new Date(periodEnd).toISOString(),
  };
}

export function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function countSearchValidatedLandingPages(entries) {
  if (!Array.isArray(entries)) return 0;
  return entries.filter((entry) => {
    const landingUv = entry?.report?.metrics?.landingUv ??
      entry?.report?.funnel?.metrics?.landingUv;
    const searchPerformance = entry?.report?.searchPerformance;
    return (
      entry?.state === "collected" &&
      landingUv?.status === "observed" &&
      Number(landingUv.value) > 0 &&
      searchPerformance?.state === "observed" &&
      Number(searchPerformance.impressions) > 0
    );
  }).length;
}

export function evaluateGrowthFeedbackGate({
  attributionJoinBlocked,
  orphanCallbacks,
  policy,
}) {
  const joinBlocked = attributionJoinBlocked === true || Number(orphanCallbacks) > 0;
  if (policy?.blockOnOrphanCallbacks && joinBlocked) {
    return {
      passed: false,
      reason: "Growth portfolio reports a broken attribution join; repair it before publishing",
    };
  }
  return { passed: true, reason: "The growth feedback gate passed." };
}

function normalizedPagePath(value) {
  try {
    return value.startsWith("/") ? new URL(value, "https://seo.invalid").pathname : new URL(value).pathname;
  } catch {
    return null;
  }
}

function selfCanonical(canonical, inspectedUrl) {
  try {
    const candidate = new URL(canonical);
    const inspected = new URL(inspectedUrl);
    return (
      candidate.origin === inspected.origin &&
      candidate.pathname.replace(/\/$/, "") === inspected.pathname.replace(/\/$/, "") &&
      candidate.search === "" &&
      candidate.hash === ""
    );
  } catch {
    return false;
  }
}

export function evaluateConsolidationEvidence({
  decision,
  entries,
  performance,
  minimumImpressions = 20,
}) {
  if (decision?.action !== "consolidate") {
    return { passed: true, reason: "No consolidation was requested." };
  }
  const sourceSlug = String(decision.sourceSlug || "");
  const targetSlug = String(decision.targetSlug || "");
  const overlapQueries = Array.isArray(decision.overlapQueries)
    ? [...new Set(decision.overlapQueries.map((query) => String(query).trim().toLowerCase()).filter(Boolean))]
    : [];
  if (!sourceSlug || !targetSlug || sourceSlug === targetSlug) {
    return {
      passed: false,
      reason: "Consolidation requires distinct published sourceSlug and targetSlug values.",
    };
  }
  if (!overlapQueries.length) {
    return {
      passed: false,
      reason: "Consolidation requires at least one explicit overlapping Search Console query.",
    };
  }
  const entryBySlug = new Map(
    (Array.isArray(entries) ? entries : []).map((entry) => [entry?.sourceSlug, entry]),
  );
  const source = entryBySlug.get(sourceSlug);
  const target = entryBySlug.get(targetSlug);
  if (source?.state !== "collected" || target?.state !== "collected") {
    return {
      passed: false,
      reason: "Consolidation requires collected public growth evidence for both source and target pages.",
    };
  }
  const sourceSearch = source.report?.searchPerformance;
  const targetSearch = target.report?.searchPerformance;
  if (
    sourceSearch?.state !== "observed" ||
    targetSearch?.state !== "observed" ||
    sourceSearch.startDate !== targetSearch.startDate ||
    sourceSearch.endDate !== targetSearch.endDate
  ) {
    return {
      passed: false,
      reason: "Consolidation requires observed exact-page Search Console evidence for both pages over the same finalized period.",
    };
  }
  if (
    Number(sourceSearch.impressions) < minimumImpressions ||
    Number(targetSearch.impressions) < minimumImpressions
  ) {
    return {
      passed: false,
      reason: `Consolidation requires at least ${minimumImpressions} exact-page impressions for both source and target pages.`,
    };
  }
  const rows = Array.isArray(performance) ? performance : [];
  const sourcePath = `/${sourceSlug}`;
  const targetPath = `/${targetSlug}`;
  for (const query of overlapQueries) {
    const matchingRows = rows.filter(
      (row) => String(row?.query || "").trim().toLowerCase() === query,
    );
    const sourceRow = matchingRows.some(
      (row) => normalizedPagePath(String(row?.url || "")) === sourcePath &&
        Number(row?.impressions) > 0,
    );
    const targetRow = matchingRows.some(
      (row) => normalizedPagePath(String(row?.url || "")) === targetPath &&
        Number(row?.impressions) > 0,
    );
    if (!sourceRow || !targetRow) {
      return {
        passed: false,
        reason: `Consolidation overlap query "${query}" must have non-zero observed rows for both exact pages.`,
      };
    }
  }
  const inspection = target.report?.urlInspection;
  if (
    inspection?.state !== "observed" ||
    inspection.pageFetchState !== "SUCCESSFUL" ||
    inspection.indexingState !== "INDEXING_ALLOWED"
  ) {
    return {
      passed: false,
      reason: "Consolidation target needs an observed URL Inspection result with successful fetch and indexing allowed.",
    };
  }
  if (
    !selfCanonical(inspection.userCanonical, inspection.pageUrl) ||
    !selfCanonical(inspection.googleCanonical, inspection.pageUrl)
  ) {
    return {
      passed: false,
      reason: "Consolidation target needs same-site self-referencing user and Google canonicals.",
    };
  }
  return {
    passed: true,
    reason: "Both pages have sufficient same-period search overlap and the target has a usable self-canonical URL Inspection result.",
  };
}

function unavailableEntry(page, reason) {
  return {
    sourceSlug: page.slug,
    path: page.path,
    keyword: page.keyword,
    state: "unavailable",
    reason,
  };
}

function unavailableRetiredUrl(page, reason) {
  return {
    sourceSlug: page.slug,
    path: page.path,
    ...(page.retiredAt ? { retiredAt: page.retiredAt } : {}),
    state: "unavailable",
    reason,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSiteUrl(value) {
  const url = new URL(String(value));
  const isLoopback = url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(isLoopback && url.protocol === "http:")) {
    throw new Error("Growth portfolio site URL must use HTTPS (HTTP is allowed only for loopback development)");
  }
  if (url.username || url.password) {
    throw new Error("Growth portfolio site URL must not contain credentials");
  }
  url.hash = "";
  url.search = "";
  url.pathname = "/";
  return url;
}

function validatePages(pages) {
  if (!Array.isArray(pages)) throw new Error("Published pages must be an array");
  if (pages.length > 500) throw new Error("Growth portfolio cannot collect more than 500 pages at once");
  const slugs = new Set();
  return pages.map((page) => {
    const slug = String(page?.slug || "");
    const path = String(page?.path || "");
    const keyword = String(page?.keyword || "").trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || path !== `/${slug}` || !keyword) {
      throw new Error("Every published page needs a safe slug, matching path, and keyword");
    }
    if (slugs.has(slug)) throw new Error(`Duplicate published page slug: ${slug}`);
    slugs.add(slug);
    return { slug, path, keyword };
  });
}

function validateRetiredPages(pages, activeSlugs) {
  if (!Array.isArray(pages)) throw new Error("Retired pages must be an array");
  const slugs = new Set();
  return pages.map((page) => {
    const slug = String(page?.slug || "");
    const path = String(page?.path || "");
    const retiredAt = page?.retiredAt == null ? null : String(page.retiredAt);
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      path !== `/${slug}` ||
      (retiredAt !== null && !Number.isFinite(Date.parse(retiredAt)))
    ) {
      throw new Error("Every retired page needs a safe slug, matching path, and optional valid retirement timestamp");
    }
    if (activeSlugs.has(slug)) {
      throw new Error(`A page cannot be both published and retired: ${slug}`);
    }
    if (slugs.has(slug)) throw new Error(`Duplicate retired page slug: ${slug}`);
    slugs.add(slug);
    return {
      slug,
      path,
      ...(retiredAt ? { retiredAt: new Date(retiredAt).toISOString() } : {}),
    };
  });
}

function validateCollectedReport(report, page, period) {
  if (!isRecord(report) || report.sourceSlug !== page.slug || !isRecord(report.funnel)) {
    throw new Error("The attribution endpoint returned a report for the wrong source page");
  }
  if (
    report.funnel.aggregationKey !== "source_slug+reporting_period" ||
    report.funnel.conversionJoinKey !== "seo_click_id" ||
    report.funnel.periodStart !== period.periodStart ||
    report.funnel.periodEnd !== period.periodEnd
  ) {
    throw new Error("The attribution endpoint returned a mismatched reporting period or join contract");
  }
  return report;
}

function publicMetric(rawMetric, allowedSources, observedDetail, unavailableDetail) {
  const sources = Array.isArray(allowedSources) ? allowedSources : [allowedSources];
  if (
    !isRecord(rawMetric) ||
    !["observed", "unavailable"].includes(rawMetric.status) ||
    !sources.includes(rawMetric.source)
  ) {
    throw new Error(`The attribution endpoint returned an invalid ${sources.join("/")} metric`);
  }
  const source = rawMetric.source;
  if (rawMetric.status === "observed") {
    const value = Number(rawMetric.value);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`The attribution endpoint returned an invalid ${source} value`);
    }
    return {
      status: "observed",
      value,
      source,
      detail: observedDetail,
    };
  }
  if (rawMetric.value !== null) {
    throw new Error(`The attribution endpoint returned an invalid unavailable ${source} metric`);
  }
  return {
    status: "unavailable",
    value: null,
    source,
    detail: unavailableDetail,
  };
}

function publicSearchPerformance(value, page, expectedOrigin) {
  if (
    !isRecord(value) ||
    !["observed", "unavailable"].includes(value.state) ||
    value.sourceSlug !== page.slug ||
    typeof value.pageUrl !== "string" ||
    typeof value.startDate !== "string" ||
    typeof value.endDate !== "string" ||
    typeof value.detail !== "string"
  ) {
    throw new Error("The attribution endpoint returned invalid Search Console evidence");
  }
  let pageUrl;
  try {
    pageUrl = new URL(value.pageUrl);
  } catch {
    throw new Error("The attribution endpoint returned an invalid Search Console page URL");
  }
  if (
    pageUrl.protocol !== "https:" ||
    pageUrl.origin !== expectedOrigin ||
    pageUrl.pathname.replace(/\/$/, "") !== page.path ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.endDate)
  ) {
    throw new Error("The attribution endpoint returned mismatched exact-page Search Console evidence");
  }
  const metricNames = ["clicks", "impressions", "ctr", "position"];
  if (value.state === "unavailable") {
    if (metricNames.some((name) => value[name] !== null)) {
      throw new Error("Unavailable Search Console evidence must keep every metric null");
    }
  } else {
    for (const name of metricNames) {
      if (name === "position" && value[name] === null) continue;
      const metric = Number(value[name]);
      if (!Number.isFinite(metric) || metric < 0 || (name === "ctr" && metric > 1)) {
        throw new Error("The attribution endpoint returned invalid Search Console metrics");
      }
    }
  }
  return {
    state: value.state,
    sourceSlug: page.slug,
    pageUrl: pageUrl.toString(),
    startDate: value.startDate,
    endDate: value.endDate,
    clicks: value.state === "observed" ? Number(value.clicks) : null,
    impressions: value.state === "observed" ? Number(value.impressions) : null,
    ctr: value.state === "observed" ? Number(value.ctr) : null,
    position: value.state === "observed" && value.position !== null
      ? Number(value.position)
      : null,
    detail: value.detail.trim(),
  };
}

function publicCanonical(value, pageUrl) {
  if (value === null) return null;
  try {
    const canonical = new URL(value);
    if (
      !["http:", "https:"].includes(canonical.protocol) ||
      canonical.origin !== pageUrl.origin
    ) {
      return null;
    }
    canonical.username = "";
    canonical.password = "";
    canonical.search = "";
    canonical.hash = "";
    return canonical.toString();
  } catch {
    return null;
  }
}

function publicUrlInspection(value, page, expectedOrigin) {
  if (
    !isRecord(value) ||
    !["observed", "unavailable"].includes(value.state) ||
    value.sourceSlug !== page.slug ||
    typeof value.pageUrl !== "string" ||
    !Number.isFinite(Date.parse(value.inspectedAt || "")) ||
    typeof value.detail !== "string" ||
    !Array.isArray(value.sitemap)
  ) {
    throw new Error("The attribution endpoint returned invalid URL Inspection evidence");
  }
  let pageUrl;
  try {
    pageUrl = new URL(value.pageUrl);
  } catch {
    throw new Error("The attribution endpoint returned an invalid URL Inspection page URL");
  }
  if (
    pageUrl.protocol !== "https:" ||
    pageUrl.origin !== expectedOrigin ||
    pageUrl.pathname.replace(/\/$/, "") !== page.path
  ) {
    throw new Error("The attribution endpoint returned mismatched URL Inspection evidence");
  }
  const nullableFields = [
    "verdict",
    "coverageState",
    "robotsTxtState",
    "indexingState",
    "pageFetchState",
    "lastCrawlTime",
    "googleCanonical",
    "userCanonical",
    "crawledAs",
  ];
  if (
    nullableFields.some((field) => value[field] !== null && typeof value[field] !== "string") ||
    value.sitemap.some((item) => typeof item !== "string" || !item.startsWith("https://")) ||
    (value.lastCrawlTime !== null && !Number.isFinite(Date.parse(value.lastCrawlTime)))
  ) {
    throw new Error("The attribution endpoint returned invalid URL Inspection fields");
  }
  if (
    value.state === "unavailable" &&
    (nullableFields.some((field) => value[field] !== null) || value.sitemap.length)
  ) {
    throw new Error("Unavailable URL Inspection evidence must keep indexed fields empty");
  }
  const googleCanonical = publicCanonical(value.googleCanonical, pageUrl);
  const userCanonical = publicCanonical(value.userCanonical, pageUrl);
  const observedDecisionFields = [
    value.verdict,
    value.coverageState,
    value.robotsTxtState,
    value.indexingState,
    value.pageFetchState,
    value.lastCrawlTime,
    googleCanonical,
    userCanonical,
    value.crawledAs,
  ];
  if (
    value.state === "observed" &&
    observedDecisionFields.every((field) => field === null)
  ) {
    throw new Error("Observed URL Inspection evidence needs a real decision field");
  }
  return {
    state: value.state,
    sourceSlug: page.slug,
    pageUrl: pageUrl.toString(),
    inspectedAt: value.inspectedAt,
    verdict: value.verdict,
    coverageState: value.coverageState,
    robotsTxtState: value.robotsTxtState,
    indexingState: value.indexingState,
    pageFetchState: value.pageFetchState,
    lastCrawlTime: value.lastCrawlTime,
    googleCanonical,
    userCanonical,
    crawledAs: value.crawledAs,
    sitemap: [],
    detail: value.detail.trim(),
  };
}

function resolveExpectedEvidenceOrigin(privateReport, expectedOrigin) {
  if (expectedOrigin !== undefined) {
    return normalizeSiteUrl(expectedOrigin).origin;
  }
  const pageUrl = privateReport?.searchPerformance?.pageUrl;
  if (typeof pageUrl !== "string") {
    throw new Error("The attribution endpoint returned invalid Search Console evidence");
  }
  try {
    const origin = new URL(pageUrl);
    if (origin.protocol !== "https:") {
      throw new Error("Search Console evidence must use HTTPS");
    }
    return origin.origin;
  } catch {
    throw new Error("The attribution endpoint returned an invalid Search Console page URL");
  }
}

export function projectPrivateGrowthReport(report, page, period, expectedOrigin) {
  const privateReport = validateCollectedReport(report, page, period);
  const normalizedExpectedOrigin = resolveExpectedEvidenceOrigin(
    privateReport,
    expectedOrigin,
  );
  const landingUv = publicMetric(
    privateReport.funnel.metrics?.landingUv,
    ["vercel_analytics", "first_party_analytics"],
    privateReport.funnel.metrics?.landingUv?.source === "first_party_analytics"
      ? "Observed the exact landing page's aggregate estimated UV through privacy-minimized first-party analytics for this reporting period."
      : "Observed the exact landing page's aggregate UV through Vercel Web Analytics for this reporting period.",
    privateReport.funnel.metrics?.landingUv?.source === "first_party_analytics"
      ? "Exact-page landing UV was unavailable from first-party analytics for this reporting period."
      : "Exact-page landing UV was unavailable from Vercel Web Analytics for this reporting period.",
  );
  const qualifiedOutboundClicks = publicMetric(
    privateReport.funnel.metrics?.qualifiedOutboundClicks,
    "seo_redirect",
    "Observed the page-level qualified outbound aggregate through the private attribution service for this reporting period.",
    "The page-level qualified outbound aggregate was unavailable from the private attribution service for this reporting period.",
  );
  const searchPerformance = publicSearchPerformance(
    privateReport.searchPerformance,
    page,
    normalizedExpectedOrigin,
  );
  const urlInspection = publicUrlInspection(
    privateReport.urlInspection,
    page,
    normalizedExpectedOrigin,
  );
  const attributionJoinChecked =
    Number.isFinite(Number(privateReport.orphanCallbacks)) &&
    Number(privateReport.orphanCallbacks) >= 0;
  const attributionJoinBlocked =
    attributionJoinChecked && Number(privateReport.orphanCallbacks) > 0;
  const samePageSearchValidated =
    landingUv.status === "observed" &&
    landingUv.value > 0 &&
    searchPerformance.state === "observed" &&
    Number(searchPerformance.impressions) > 0;

  return {
    sourceSlug: page.slug,
    metrics: {
      landingUv,
      qualifiedOutboundClicks,
    },
    searchPerformance,
    urlInspection,
    decisionState: {
      landingUvReady: landingUv.status === "observed",
      qualifiedOutboundReady: qualifiedOutboundClicks.status === "observed",
      searchPerformanceReady: searchPerformance.state === "observed",
      urlInspectionReady: urlInspection.state === "observed",
      attributionJoinChecked,
      attributionJoinBlocked,
      samePageSearchValidated,
    },
  };
}

export function projectPrivateRetiredUrlReport(report, page, period, expectedOrigin) {
  const privateReport = validateCollectedReport(report, page, period);
  const normalizedExpectedOrigin = resolveExpectedEvidenceOrigin(
    privateReport,
    expectedOrigin,
  );
  return {
    searchPerformance: publicSearchPerformance(
      privateReport.searchPerformance,
      page,
      normalizedExpectedOrigin,
    ),
    urlInspection: publicUrlInspection(
      privateReport.urlInspection,
      page,
      normalizedExpectedOrigin,
    ),
  };
}

export async function collectGrowthPortfolio({
  pages,
  retiredPages = [],
  automationToken,
  siteUrl = canonicalSiteOrigin,
  days = 28,
  reportingLagDays = 3,
  now = new Date(),
  fetchImpl = fetch,
}) {
  const normalizedPages = validatePages(pages);
  const normalizedRetiredPages = validateRetiredPages(
    retiredPages,
    new Set(normalizedPages.map((page) => page.slug)),
  );
  if (normalizedPages.length + normalizedRetiredPages.length > 500) {
    throw new Error("Growth portfolio cannot collect more than 500 active and retired pages at once");
  }
  const period = completeShanghaiWindow(days, now, reportingLagDays);
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const authorization = typeof automationToken === "string" &&
    Buffer.byteLength(automationToken, "utf8") >= 32
    ? `Bearer ${automationToken}`
    : null;

  const entries = await Promise.all(normalizedPages.map(async (page) => {
    if (!authorization) {
      return unavailableEntry(
        page,
        "SEO_AUTOMATION_TOKEN is missing or shorter than 32 bytes, so private page-level attribution could not be collected.",
      );
    }

    const endpoint = new URL("/api/attribution/report", normalizedSiteUrl);
    endpoint.searchParams.set("sourceSlug", page.slug);
    endpoint.searchParams.set("from", period.periodStart);
    endpoint.searchParams.set("to", period.periodEnd);
    try {
      const response = await fetchImpl(endpoint, {
        headers: { authorization },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return unavailableEntry(
          page,
          `Private attribution evidence returned HTTP ${response.status}; no page metrics were persisted.`,
        );
      }
      const responseBody = await response.text();
      if (responseBody.length > 1_000_000) {
        throw new Error("Attribution report exceeded the 1 MB response limit");
      }
      const report = projectPrivateGrowthReport(
        JSON.parse(responseBody),
        page,
        period,
        normalizedSiteUrl.origin,
      );
      return {
        sourceSlug: page.slug,
        path: page.path,
        keyword: page.keyword,
        state: "collected",
        report,
      };
    } catch (error) {
      return unavailableEntry(
        page,
        `Private attribution evidence could not be converted into a safe public page snapshot (${error instanceof Error ? error.name : "unknown error"}).`,
      );
    }
  }));

  const retiredUrls = await Promise.all(normalizedRetiredPages.map(async (page) => {
    if (!authorization) {
      return unavailableRetiredUrl(
        page,
        "SEO_AUTOMATION_TOKEN is missing or shorter than 32 bytes, so retired-URL Search Console evidence could not be collected.",
      );
    }

    const endpoint = new URL("/api/attribution/report", normalizedSiteUrl);
    endpoint.searchParams.set("sourceSlug", page.slug);
    endpoint.searchParams.set("from", period.periodStart);
    endpoint.searchParams.set("to", period.periodEnd);
    try {
      const response = await fetchImpl(endpoint, {
        headers: { authorization },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return unavailableRetiredUrl(
          page,
          `Private retired-URL evidence returned HTTP ${response.status}; no Search Console evidence was persisted.`,
        );
      }
      const responseBody = await response.text();
      if (responseBody.length > 1_000_000) {
        throw new Error("Attribution report exceeded the 1 MB response limit");
      }
      const report = projectPrivateRetiredUrlReport(
        JSON.parse(responseBody),
        page,
        period,
        normalizedSiteUrl.origin,
      );
      return {
        sourceSlug: page.slug,
        path: page.path,
        ...(page.retiredAt ? { retiredAt: page.retiredAt } : {}),
        state: "collected",
        ...report,
      };
    } catch (error) {
      return unavailableRetiredUrl(
        page,
        `Private retired-URL evidence could not be converted into a safe public Search Console snapshot (${error instanceof Error ? error.name : "unknown error"}).`,
      );
    }
  }));

  const collectedEntries = entries.filter((entry) => entry.state === "collected");
  const attributionJoinBlocked = collectedEntries.some(
    (entry) => entry.report.decisionState.attributionJoinBlocked,
  );
  const attributionJoinReady =
    collectedEntries.length === entries.length &&
    collectedEntries.every((entry) => entry.report.decisionState.attributionJoinChecked);
  const hasSearchValidatedLandingPage = countSearchValidatedLandingPages(entries) > 0;

  return {
    schemaVersion: 2,
    privacyClass: "public_growth_evidence",
    generatedAt: new Date(now).toISOString(),
    periodBasis: "complete_shanghai_calendar_days",
    reportingWindowDays: days,
    reportingLagDays,
    aggregationKey: "source_slug+reporting_period",
    ...period,
    summary: {
      publishedPages: entries.length,
      collectedPages: collectedEntries.length,
      unavailablePages: entries.filter((entry) => entry.state === "unavailable").length,
      attributionJoinReady,
      attributionJoinBlocked,
      hasSearchValidatedLandingPage,
    },
    entries,
    retiredUrls,
  };
}
