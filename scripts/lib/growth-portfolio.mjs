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
    const landingUv = entry?.report?.funnel?.metrics?.landingUv;
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
  publicationMode,
  hasDraft,
  publishedPageCount,
  searchValidatedLandingPages,
  orphanCallbacks,
  policy,
}) {
  if (policy?.blockOnOrphanCallbacks && orphanCallbacks > 0) {
    return {
      passed: false,
      reason: `Growth portfolio contains ${orphanCallbacks} orphan conversion callback(s); repair attribution before publishing`,
    };
  }
  if (
    publicationMode !== "update" &&
    hasDraft &&
    publishedPageCount >= Number(policy?.coldStartPublishedPageLimit ?? 0) &&
    searchValidatedLandingPages < Number(policy?.minimumSearchValidatedLandingPages ?? 1)
  ) {
    return {
      passed: false,
      reason: "Growth feedback gate blocked a new page: at least one published page needs non-zero landing UV and non-zero exact-page Search Console impressions; direct or internal UV alone does not qualify",
    };
  }
  return { passed: true, reason: "The growth feedback gate passed." };
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

export async function collectGrowthPortfolio({
  pages,
  password,
  siteUrl = "https://seo-pi-fawn.vercel.app",
  days = 28,
  reportingLagDays = 3,
  now = new Date(),
  fetchImpl = fetch,
}) {
  const normalizedPages = validatePages(pages);
  const period = completeShanghaiWindow(days, now, reportingLagDays);
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const authorization = password
    ? `Basic ${Buffer.from(`seo:${password}`).toString("base64")}`
    : null;

  const entries = await Promise.all(normalizedPages.map(async (page) => {
    if (!authorization) {
      return unavailableEntry(
        page,
        "WORKBENCH_PASSWORD is not configured, so private page-level attribution could not be collected.",
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
        const detail = (await response.text()).trim().slice(0, 240);
        return unavailableEntry(
          page,
          `Attribution report returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
        );
      }
      const responseBody = await response.text();
      if (responseBody.length > 1_000_000) {
        throw new Error("Attribution report exceeded the 1 MB response limit");
      }
      const report = validateCollectedReport(JSON.parse(responseBody), page, period);
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
        `Attribution collection failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }));

  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    periodBasis: "complete_shanghai_calendar_days",
    reportingWindowDays: days,
    reportingLagDays,
    aggregationKey: "source_slug+reporting_period",
    conversionJoinKey: "seo_click_id",
    ...period,
    summary: {
      publishedPages: entries.length,
      collectedPages: entries.filter((entry) => entry.state === "collected").length,
      unavailablePages: entries.filter((entry) => entry.state === "unavailable").length,
    },
    entries,
  };
}
