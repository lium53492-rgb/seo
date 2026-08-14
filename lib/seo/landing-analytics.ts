import {
  firstPartyLandingAnalyticsStatus,
  readFirstPartyLandingAnalytics,
} from "./attribution-store";
import {
  readLandingUv as readVercelLandingUv,
  vercelAnalyticsStatus,
} from "./vercel-analytics";

export type LandingAnalyticsSource =
  | "vercel_analytics"
  | "first_party_analytics";

export type LandingAnalyticsResult = {
  state: "observed" | "unavailable";
  source: LandingAnalyticsSource;
  visitors: number | null;
  pageviews: number | null;
  detail: string;
};

export function landingAnalyticsStatus() {
  const vercel = vercelAnalyticsStatus();
  const firstParty = firstPartyLandingAnalyticsStatus();
  if (firstParty.configured) {
    return {
      configured: true,
      provider: "first_party_upstash" as const,
      startedAt: firstParty.startedAt,
      firstCompleteShanghaiDayStart: firstParty.firstCompleteShanghaiDayStart,
      fallbackProvider: vercel.configured
        ? "vercel_web_analytics" as const
        : null,
    };
  }
  if (vercel.configured) {
    return {
      configured: true,
      provider: "vercel_web_analytics" as const,
      fallbackProvider: null,
    };
  }
  return {
    configured: false,
    provider: "landing_analytics" as const,
    fallbackProvider: null,
    detail: [vercel.detail, firstParty.detail].filter(Boolean).join(" "),
  };
}

export async function readLandingAnalytics(input: {
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
}): Promise<LandingAnalyticsResult> {
  const firstPartyStatus = firstPartyLandingAnalyticsStatus();
  let firstParty: LandingAnalyticsResult | null = null;
  if (firstPartyStatus.configured) {
    try {
      const result = await readFirstPartyLandingAnalytics(input);
      firstParty = { ...result, source: "first_party_analytics" };
      if (firstParty.state === "observed") return firstParty;
    } catch (error) {
      firstParty = {
        state: "unavailable",
        source: "first_party_analytics",
        visitors: null,
        pageviews: null,
        detail: `First-party landing analytics request failed: ${error instanceof Error ? error.name : "network_error"}.`,
      };
    }
  }

  const vercelStatus = vercelAnalyticsStatus();
  if (vercelStatus.configured) {
    let vercel: LandingAnalyticsResult;
    try {
      vercel = await readVercelLandingUv(input);
    } catch (error) {
      vercel = {
        state: "unavailable",
        source: "vercel_analytics",
        visitors: null,
        pageviews: null,
        detail: `Vercel landing analytics request failed: ${
          error instanceof Error ? error.name : "network_error"
        }.`,
      };
    }
    if (vercel.state === "observed") return vercel;
    return firstParty
      ? { ...firstParty, detail: `${firstParty.detail} ${vercel.detail}` }
      : vercel;
  }

  if (firstParty) return firstParty;
  const unavailable = await readFirstPartyLandingAnalytics(input);
  return { ...unavailable, source: "first_party_analytics" };
}
