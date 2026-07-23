const defaultProjectId = "prj_Qd3p3ml63hElGzar9myWPNuT9wVJ";
const defaultTeamId = "team_ciR2KmsqedGg5FIi1nqjSJCu";
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type LandingUvResult = {
  state: "observed" | "unavailable";
  visitors: number | null;
  pageviews: number | null;
  detail: string;
};

function analyticsConfig() {
  const token = process.env.VERCEL_ANALYTICS_TOKEN || process.env.VERCEL_TOKEN;
  return token ? {
    token,
    projectId: process.env.VERCEL_ANALYTICS_PROJECT_ID || process.env.VERCEL_PROJECT_ID || defaultProjectId,
    teamId: process.env.VERCEL_ANALYTICS_TEAM_ID || process.env.VERCEL_TEAM_ID || defaultTeamId,
  } : null;
}

export function vercelAnalyticsStatus() {
  return analyticsConfig()
    ? { configured: true, provider: "vercel_web_analytics" as const }
    : {
        configured: false,
        provider: "vercel_web_analytics" as const,
        detail: "VERCEL_ANALYTICS_TOKEN is not configured for the public Web Analytics API.",
      };
}

export async function readLandingUv(input: {
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
}): Promise<LandingUvResult> {
  if (!safeSlug.test(input.sourceSlug)) throw new Error("Analytics source slug is invalid");
  const start = new Date(input.periodStart);
  const end = new Date(input.periodEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error("Analytics reporting period is invalid");
  }
  const config = analyticsConfig();
  if (!config) {
    return {
      state: "unavailable",
      visitors: null,
      pageviews: null,
      detail: "VERCEL_ANALYTICS_TOKEN is not configured for the public Web Analytics API.",
    };
  }

  const endpoint = new URL("https://api.vercel.com/v1/query/web-analytics/visits/count");
  endpoint.searchParams.set("projectId", config.projectId);
  endpoint.searchParams.set("teamId", config.teamId);
  endpoint.searchParams.set("since", start.toISOString());
  endpoint.searchParams.set("until", end.toISOString());
  endpoint.searchParams.set("filter", `requestPath eq '/${input.sourceSlug}'`);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${config.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    return {
      state: "unavailable",
      visitors: null,
      pageviews: null,
      detail: `Vercel Web Analytics request failed: ${error instanceof Error ? error.name : "network_error"}.`,
    };
  }
  if (!response.ok) {
    return {
      state: "unavailable",
      visitors: null,
      pageviews: null,
      detail: `Vercel Web Analytics API returned ${response.status}.`,
    };
  }
  const payload = await response.json() as {
    data?: { visitors?: unknown; pageviews?: unknown };
  };
  const visitors = Number(payload.data?.visitors);
  const pageviews = Number(payload.data?.pageviews);
  if (!Number.isFinite(visitors) || visitors < 0 || !Number.isFinite(pageviews) || pageviews < 0) {
    return {
      state: "unavailable",
      visitors: null,
      pageviews: null,
      detail: "Vercel Web Analytics returned an invalid count response.",
    };
  }
  return {
    state: "observed",
    visitors,
    pageviews,
    detail: `Observed /${input.sourceSlug} through Vercel Web Analytics for the requested period.`,
  };
}
