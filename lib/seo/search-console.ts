import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import type { SearchConsolePerformanceSnapshot } from "./types";

const searchConsoleScope = "https://www.googleapis.com/auth/webmasters.readonly";
const requestTimeoutMs = 5_000;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fallbackSiteUrl = "https://seo-pi-fawn.vercel.app";

export type SearchConsolePagePerformance = SearchConsolePerformanceSnapshot;

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

function publicSiteUrl() {
  const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || fallbackSiteUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development");
  }
  return url;
}

function configuredSiteUrl() {
  const value = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim();
  if (value) return value;
  const site = publicSiteUrl();
  return `${site.origin}/`;
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
  const pageUrl = new URL(`/${input.sourceSlug}`, publicSiteUrl()).toString();
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
