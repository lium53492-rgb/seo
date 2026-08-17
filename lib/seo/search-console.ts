import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import type {
  SearchConsolePerformanceSnapshot,
  SearchConsoleUrlInspectionSnapshot,
} from "./types";
// Node's native TypeScript test runner requires the explicit extension, while
// this no-emit project intentionally leaves allowImportingTsExtensions off.
// @ts-expect-error TS5097: the Next.js bundler and Node 24 both resolve this file.
import { absoluteSiteUrl, getSiteBasePath, getSiteUrl } from "./site.ts";

const searchConsoleScope = "https://www.googleapis.com/auth/webmasters.readonly";
const requestTimeoutMs = 5_000;
const urlInspectionRequestTimeoutMs = 15_000;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const rfc3339Zulu = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export type SearchConsolePagePerformance = SearchConsolePerformanceSnapshot;
export type SearchConsoleUrlInspection = SearchConsoleUrlInspectionSnapshot;

type SearchConsoleConfig = {
  clientEmail: string;
  privateKey: string;
  siteUrl: string;
};

let cachedAuth: GoogleAuth | null = null;
let cachedIdentity = "";

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function configuredSiteUrl() {
  const publicSite = getSiteUrl();
  const value = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim();
  if (value) {
    if (value.toLowerCase().startsWith("sc-domain:")) {
      const domain = value.slice("sc-domain:".length)
        .trim()
        .toLowerCase()
        .replace(/\.$/, "");
      if (
        !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) ||
        domain.includes("..") ||
        domain.split(".").length < 2 ||
        !(
          publicSite.hostname === domain ||
          publicSite.hostname.endsWith(`.${domain}`)
        )
      ) {
        throw new Error(
          "GOOGLE_SEARCH_CONSOLE_SITE_URL domain property must cover the public canonical hostname",
        );
      }
      return `sc-domain:${domain}`;
    }
    let property: URL;
    try {
      property = new URL(value);
    } catch {
      throw new Error(
        "GOOGLE_SEARCH_CONSOLE_SITE_URL must be a valid URL-prefix or sc-domain property",
      );
    }
    if (property.username || property.password) {
      throw new Error(
        "GOOGLE_SEARCH_CONSOLE_SITE_URL must not contain credentials",
      );
    }
    const publicBasePath = getSiteBasePath();
    const normalizedPropertyPath = property.pathname.replace(/\/$/, "") || "/";
    if (
      property.origin !== publicSite.origin ||
      (normalizedPropertyPath !== "/" && normalizedPropertyPath !== publicBasePath) ||
      property.search ||
      property.hash
    ) {
      throw new Error(
        "GOOGLE_SEARCH_CONSOLE_SITE_URL URL-prefix property must cover the public canonical guides path",
      );
    }
    return normalizedPropertyPath === "/"
      ? `${publicSite.origin}/`
      : `${publicSite.origin}${publicBasePath}/`;
  }
  return `${publicSite.origin}/`;
}

function searchConsoleConfig(): SearchConsoleConfig | null {
  const clientEmail = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(
    process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY || "",
  );
  if (!clientEmail || !privateKey) return null;
  return {
    clientEmail,
    privateKey,
    siteUrl: configuredSiteUrl(),
  };
}

export function searchConsoleStatus() {
  const missing = [];
  if (!process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL?.trim()) {
    missing.push("GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL");
  }
  if (!process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY?.trim()) {
    missing.push("GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY");
  }
  if (missing.length) {
    return {
      configured: false,
      provider: "google_search_console" as const,
      detail: `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not configured.`,
    };
  }
  return {
    configured: true,
    provider: "google_search_console" as const,
    siteUrl: configuredSiteUrl(),
  };
}

function authClient(config: SearchConsoleConfig) {
  const privateKeyDigest = createHash("sha256")
    .update(config.privateKey)
    .digest("hex");
  const identity = `${config.clientEmail}:${config.siteUrl}:${privateKeyDigest}`;
  if (!cachedAuth || cachedIdentity !== identity) {
    cachedAuth = new GoogleAuth({
      credentials: {
        client_email: config.clientEmail,
        private_key: config.privateKey,
      },
      scopes: [searchConsoleScope],
    });
    cachedIdentity = identity;
  }
  return cachedAuth;
}

function shanghaiDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function reportingDates(periodStart: string, periodEnd: string) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error("Search Console reporting period is invalid");
  }
  return {
    startDate: shanghaiDate(start),
    endDate: shanghaiDate(new Date(end.getTime() - 1)),
  };
}

function unavailable(input: {
  sourceSlug: string;
  pageUrl: string;
  startDate: string;
  endDate: string;
  detail: string;
}): SearchConsolePagePerformance {
  return {
    state: "unavailable",
    sourceSlug: input.sourceSlug,
    pageUrl: input.pageUrl,
    startDate: input.startDate,
    endDate: input.endDate,
    clicks: null,
    impressions: null,
    ctr: null,
    position: null,
    detail: input.detail,
  };
}

const inspectionVerdicts = new Set([
  "VERDICT_UNSPECIFIED",
  "PASS",
  "PARTIAL",
  "FAIL",
  "NEUTRAL",
] as const);
const inspectionRobotsTxtStates = new Set([
  "ROBOTS_TXT_STATE_UNSPECIFIED",
  "ALLOWED",
  "DISALLOWED",
] as const);
const inspectionIndexingStates = new Set([
  "INDEXING_STATE_UNSPECIFIED",
  "INDEXING_ALLOWED",
  "BLOCKED_BY_META_TAG",
  "BLOCKED_BY_HTTP_HEADER",
  "BLOCKED_BY_ROBOTS_TXT",
] as const);
const inspectionPageFetchStates = new Set([
  "PAGE_FETCH_STATE_UNSPECIFIED",
  "SUCCESSFUL",
  "SOFT_404",
  "BLOCKED_ROBOTS_TXT",
  "NOT_FOUND",
  "ACCESS_DENIED",
  "SERVER_ERROR",
  "REDIRECT_ERROR",
  "ACCESS_FORBIDDEN",
  "BLOCKED_4XX",
  "INTERNAL_CRAWL_ERROR",
  "INVALID_URL",
] as const);
const inspectionCrawlers = new Set([
  "CRAWLING_USER_AGENT_UNSPECIFIED",
  "DESKTOP",
  "MOBILE",
] as const);

type InspectionIndexStatusPayload = {
  verdict?: unknown;
  coverageState?: unknown;
  robotsTxtState?: unknown;
  indexingState?: unknown;
  pageFetchState?: unknown;
  lastCrawlTime?: unknown;
  googleCanonical?: unknown;
  userCanonical?: unknown;
  crawledAs?: unknown;
  sitemap?: unknown;
};

type ParsedCanonical = {
  value: string | null;
  state: "absent" | "accepted" | "normalized" | "cross_site" | "invalid";
};

type ParsedInspectionIndexStatus = {
  value: {
    verdict: SearchConsoleUrlInspection["verdict"];
    coverageState: string | null;
    robotsTxtState: SearchConsoleUrlInspection["robotsTxtState"];
    indexingState: SearchConsoleUrlInspection["indexingState"];
    pageFetchState: SearchConsoleUrlInspection["pageFetchState"];
    lastCrawlTime: string | null;
    googleCanonical: string | null;
    userCanonical: string | null;
    crawledAs: SearchConsoleUrlInspection["crawledAs"];
    sitemap: [];
  } | null;
  detail: string | null;
};

function inspectionUnavailable(input: {
  sourceSlug: string;
  pageUrl: string;
  inspectedAt: string;
  detail: string;
}): SearchConsoleUrlInspection {
  return {
    state: "unavailable",
    sourceSlug: input.sourceSlug,
    pageUrl: input.pageUrl,
    inspectedAt: input.inspectedAt,
    verdict: null,
    coverageState: null,
    robotsTxtState: null,
    indexingState: null,
    pageFetchState: null,
    lastCrawlTime: null,
    googleCanonical: null,
    userCanonical: null,
    crawledAs: null,
    sitemap: [],
    detail: input.detail,
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sameSiteCanonical(value: unknown, siteOrigin: string): ParsedCanonical {
  if (value === undefined) return { value: null, state: "absent" };
  const text = optionalString(value);
  if (!text) return { value: null, state: "invalid" };
  try {
    const parsed = new URL(text);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.origin !== siteOrigin
    ) {
      return { value: null, state: "cross_site" };
    }
    const original = parsed.toString();
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    const normalized = parsed.toString();
    return {
      value: normalized,
      state: normalized === original ? "accepted" : "normalized",
    };
  } catch {
    return { value: null, state: "invalid" };
  }
}

function optionalEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>) {
  return typeof value === "string" && allowed.has(value as T)
    ? value as T
    : null;
}

function parseInspectionIndexStatus(
  value: unknown,
  siteOrigin: string,
): ParsedInspectionIndexStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      value: null,
      detail: "URL Inspection API returned an invalid index-status result.",
    };
  }
  const payload = value as InspectionIndexStatusPayload;

  const lastCrawlTime = optionalString(payload.lastCrawlTime);
  if (
    lastCrawlTime &&
    (
      !rfc3339Zulu.test(lastCrawlTime) ||
      !Number.isFinite(Date.parse(lastCrawlTime))
    )
  ) {
    return {
      value: null,
      detail: "URL Inspection API returned an invalid index-status result.",
    };
  }

  const coverageState = optionalString(payload.coverageState);
  const verdict = optionalEnum(payload.verdict, inspectionVerdicts);
  const robotsTxtState = optionalEnum(
    payload.robotsTxtState,
    inspectionRobotsTxtStates,
  );
  const indexingState = optionalEnum(
    payload.indexingState,
    inspectionIndexingStates,
  );
  const pageFetchState = optionalEnum(
    payload.pageFetchState,
    inspectionPageFetchStates,
  );
  const crawledAs = optionalEnum(payload.crawledAs, inspectionCrawlers);
  const googleCanonical = sameSiteCanonical(payload.googleCanonical, siteOrigin);
  const userCanonical = sameSiteCanonical(payload.userCanonical, siteOrigin);

  if (
    (payload.verdict !== undefined && !verdict) ||
    (payload.robotsTxtState !== undefined && !robotsTxtState) ||
    (payload.indexingState !== undefined && !indexingState) ||
    (payload.pageFetchState !== undefined && !pageFetchState) ||
    (payload.crawledAs !== undefined && !crawledAs) ||
    (payload.coverageState !== undefined && !coverageState) ||
    (payload.lastCrawlTime !== undefined && !lastCrawlTime) ||
    googleCanonical.state === "invalid" ||
    userCanonical.state === "invalid"
  ) {
    return {
      value: null,
      detail: "URL Inspection API returned an invalid index-status result.",
    };
  }

  const omittedCanonicals = [
    googleCanonical.state === "cross_site" ? "Google-selected" : null,
    userCanonical.state === "cross_site" ? "user-declared" : null,
  ].filter((entry): entry is string => Boolean(entry));
  const normalizedCanonicals = [
    googleCanonical.state === "normalized" ? "Google-selected" : null,
    userCanonical.state === "normalized" ? "user-declared" : null,
  ].filter((entry): entry is string => Boolean(entry));
  const canonicalNotes = [];
  if (omittedCanonicals.length) {
    canonicalNotes.push(
      `${omittedCanonicals.join(" and ")} cross-site canonical ${omittedCanonicals.length === 1 ? "was" : "were"} omitted.`,
    );
  }
  if (normalizedCanonicals.length) {
    canonicalNotes.push(
      `${normalizedCanonicals.join(" and ")} canonical ${normalizedCanonicals.length === 1 ? "was" : "were"} normalized without credentials, query, or fragment.`,
    );
  }

  const hasDecisionEvidence = Boolean(
    verdict ||
    coverageState ||
    robotsTxtState ||
    indexingState ||
    pageFetchState ||
    googleCanonical.value ||
    userCanonical.value,
  );
  if (!hasDecisionEvidence) {
    return {
      value: null,
      detail: [
        "URL Inspection API returned no usable decision evidence.",
        ...canonicalNotes,
      ].join(" "),
    };
  }

  return {
    value: {
      verdict,
      coverageState,
      robotsTxtState,
      indexingState,
      pageFetchState,
      lastCrawlTime,
      googleCanonical: googleCanonical.value,
      userCanonical: userCanonical.value,
      crawledAs,
      // Sitemap URLs can expose private or obsolete discovery paths and are
      // not required for page-level indexing decisions, so never persist them.
      sitemap: [],
    },
    detail: canonicalNotes.length ? canonicalNotes.join(" ") : null,
  };
}

export async function readSearchConsoleUrlInspection(input: {
  sourceSlug: string;
}, options: {
  fetchImpl?: typeof fetch;
  getAccessToken?: (config: SearchConsoleConfig) => Promise<string | null>;
  now?: () => Date;
} = {}): Promise<SearchConsoleUrlInspection> {
  if (!safeSlug.test(input.sourceSlug)) {
    throw new Error("Search Console source slug is invalid");
  }
  const inspectedAt = (options.now?.() || new Date()).toISOString();
  const pageUrl = absoluteSiteUrl(`/${input.sourceSlug}`);
  const config = searchConsoleConfig();
  if (!config) {
    return inspectionUnavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      inspectedAt,
      detail: searchConsoleStatus().detail ?? "Search Console is not configured.",
    });
  }

  let token: string | null | undefined;
  try {
    token = options.getAccessToken
      ? await options.getAccessToken(config)
      : await authClient(config).getAccessToken();
  } catch (error) {
    return inspectionUnavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      inspectedAt,
      detail: `Search Console authorization failed: ${error instanceof Error ? error.name : "authentication_error"}.`,
    });
  }
  if (!token) {
    return inspectionUnavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      inspectedAt,
      detail: "Search Console authorization did not return an access token.",
    });
  }

  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          inspectionUrl: pageUrl,
          siteUrl: config.siteUrl,
          languageCode: "en-US",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(urlInspectionRequestTimeoutMs),
      },
    );
  } catch (error) {
    return inspectionUnavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      inspectedAt,
      detail: `URL Inspection query failed: ${error instanceof Error ? error.name : "network_error"}.`,
    });
  }
  if (!response.ok) {
    return inspectionUnavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      inspectedAt,
      detail: `URL Inspection API returned ${response.status}.`,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return inspectionUnavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      inspectedAt,
      detail: "URL Inspection API returned invalid JSON.",
    });
  }
  const inspectionResult = (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "inspectionResult" in payload
  )
    ? (payload as { inspectionResult?: unknown }).inspectionResult
    : null;
  const indexStatusResult = (
    inspectionResult &&
    typeof inspectionResult === "object" &&
    !Array.isArray(inspectionResult) &&
    "indexStatusResult" in inspectionResult
  )
    ? (inspectionResult as { indexStatusResult?: unknown }).indexStatusResult
    : null;
  const parsed = parseInspectionIndexStatus(
    indexStatusResult,
    new URL(pageUrl).origin,
  );
  if (!parsed.value) {
    return inspectionUnavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      inspectedAt,
      detail: parsed.detail || "URL Inspection API returned an invalid index-status result.",
    });
  }

  return {
    state: "observed",
    sourceSlug: input.sourceSlug,
    pageUrl,
    inspectedAt,
    ...parsed.value,
    detail: [
      "Observed Google's indexed-version URL Inspection result for this exact canonical page; this is not a live-page test.",
      parsed.detail,
    ].filter(Boolean).join(" "),
  };
}

export async function readSearchConsolePagePerformance(input: {
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
}, options: {
  fetchImpl?: typeof fetch;
  getAccessToken?: (config: SearchConsoleConfig) => Promise<string | null>;
} = {}): Promise<SearchConsolePagePerformance> {
  const fetchImpl = options.fetchImpl || fetch;
  if (!safeSlug.test(input.sourceSlug)) {
    throw new Error("Search Console source slug is invalid");
  }
  const { startDate, endDate } = reportingDates(input.periodStart, input.periodEnd);
  const pageUrl = absoluteSiteUrl(`/${input.sourceSlug}`);
  const config = searchConsoleConfig();
  if (!config) {
    return unavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      startDate,
      endDate,
      detail: searchConsoleStatus().detail ?? "Search Console is not configured.",
    });
  }

  let token: string | null | undefined;
  try {
    token = options.getAccessToken
      ? await options.getAccessToken(config)
      : await authClient(config).getAccessToken();
  } catch (error) {
    return unavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      startDate,
      endDate,
      detail: `Search Console authorization failed: ${error instanceof Error ? error.name : "authentication_error"}.`,
    });
  }
  if (!token) {
    return unavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      startDate,
      endDate,
      detail: "Search Console authorization did not return an access token.",
    });
  }

  const endpoint = new URL(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(config.siteUrl)}/searchAnalytics/query`,
  );
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["page"],
        type: "web",
        dataState: "final",
        aggregationType: "auto",
        dimensionFilterGroups: [{
          groupType: "and",
          filters: [{
            dimension: "page",
            operator: "equals",
            expression: pageUrl,
          }],
        }],
        rowLimit: 25,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    return unavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      startDate,
      endDate,
      detail: `Search Console query failed: ${error instanceof Error ? error.name : "network_error"}.`,
    });
  }
  if (!response.ok) {
    return unavailable({
      sourceSlug: input.sourceSlug,
      pageUrl,
      startDate,
      endDate,
      detail: `Search Console API returned ${response.status}.`,
    });
  }

  const payload = await response.json() as {
    rows?: Array<{
      clicks?: unknown;
      impressions?: unknown;
      ctr?: unknown;
      position?: unknown;
    }>;
  };
  const rows = payload.rows || [];
  if (!rows.length) {
    return {
      state: "observed",
      sourceSlug: input.sourceSlug,
      pageUrl,
      startDate,
      endDate,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: null,
      detail: `Search Console final-data query succeeded for ${startDate} through ${endDate} and returned no row for this exact page.`,
    };
  }

  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    const rowClicks = Number(row.clicks);
    const rowImpressions = Number(row.impressions);
    const rowPosition = Number(row.position);
    const rowCtr = Number(row.ctr);
    if (
      !Number.isFinite(rowClicks) ||
      rowClicks < 0 ||
      !Number.isFinite(rowImpressions) ||
      rowImpressions < 0 ||
      !Number.isFinite(rowCtr) ||
      rowCtr < 0 ||
      rowCtr > 1 ||
      !Number.isFinite(rowPosition) ||
      rowPosition < 0
    ) {
      return unavailable({
        sourceSlug: input.sourceSlug,
        pageUrl,
        startDate,
        endDate,
        detail: "Search Console returned an invalid page-performance row.",
      });
    }
    clicks += rowClicks;
    impressions += rowImpressions;
    weightedPosition += rowPosition * rowImpressions;
  }

  return {
    state: "observed",
    sourceSlug: input.sourceSlug,
    pageUrl,
    startDate,
    endDate,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weightedPosition / impressions : null,
    detail: `Observed finalized Search Console data for ${startDate} through ${endDate}; Search Console labels days in Pacific Time while the portfolio keeps its Shanghai-day release boundary.`,
  };
}
