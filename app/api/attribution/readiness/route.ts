import {
  isPrivateAttributionAccessConfigured,
  isPrivateAttributionRequestAuthorized,
} from "@/lib/seo/auth";
import seoPolicy from "@/data/config/seo-policy.json";
import {
  attributionStoreStatus,
  readNovelAiIntegrationProbe,
} from "@/lib/seo/attribution-store";
import { readLiveGrowthFunnel } from "@/lib/seo/growth-funnel";
import { listPublishedPages } from "@/lib/seo/page-store";
import { privateJson } from "@/lib/seo/private-response";
import { shanghaiReportingWindow } from "@/lib/seo/reporting-period";
import { searchConsoleStatus } from "@/lib/seo/search-console";
import { vercelAnalyticsStatus } from "@/lib/seo/vercel-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReadinessSourceStatus = {
  configured: boolean;
  provider: string;
};

function readSourceStatus<T extends ReadinessSourceStatus>(input: {
  provider: string;
  label: string;
  read: () => T;
}): T | (ReadinessSourceStatus & {
  configured: false;
  state: "unavailable";
  reason: "status_check_failed";
  detail: string;
}) {
  try {
    return input.read();
  } catch (error) {
    return {
      configured: false,
      provider: input.provider,
      state: "unavailable",
      reason: "status_check_failed",
      detail: `${input.label} status check failed: ${
        error instanceof Error && error.message
          ? error.message
          : "Unknown configuration error"
      }`,
    };
  }
}

export async function GET(request: Request) {
  if (!isPrivateAttributionAccessConfigured()) {
    return privateJson({ error: "Private growth readiness is not configured" }, { status: 503 });
  }
  if (!isPrivateAttributionRequestAuthorized(request)) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  const pages = await listPublishedPages();
  const probePage = pages[0] ?? null;
  const reportingWindowDays = Number(seoPolicy.feedbackLoop.reportingWindowDays);
  const reportingLagDays = Number(seoPolicy.feedbackLoop.reportingLagDays);
  const period = shanghaiReportingWindow(1, new Date(), reportingLagDays);
  let probe = null;
  if (probePage) {
    try {
      const growth = await readLiveGrowthFunnel({
        sourceSlug: probePage.slug,
        ...period,
      });
      probe = {
        sourceSlug: probePage.slug,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        searchConsole: {
          state: growth.searchPerformance.state,
          detail: growth.searchPerformance.detail,
        },
        urlInspection: {
          state: growth.urlInspection.state,
          detail: growth.urlInspection.detail,
        },
        landingUv: {
          state: growth.funnel.metrics.landingUv.status,
          detail: growth.funnel.metrics.landingUv.detail,
        },
        attributionStore: {
          state: growth.funnel.metrics.qualifiedOutboundClicks.status,
          detail: growth.funnel.metrics.qualifiedOutboundClicks.detail,
        },
      };
    } catch (error) {
      probe = {
        sourceSlug: probePage.slug,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        state: "failed",
        detail: error instanceof Error ? error.message : "Growth readiness probe failed.",
      };
    }
  }

  const searchConsole = readSourceStatus({
    provider: "google_search_console",
    label: "Search Console",
    read: searchConsoleStatus,
  });
  const landingUv = readSourceStatus({
    provider: "vercel_web_analytics",
    label: "Vercel Web Analytics",
    read: vercelAnalyticsStatus,
  });
  const attributionStore = readSourceStatus({
    provider: "upstash_redis",
    label: "Attribution store",
    read: attributionStoreStatus,
  });
  const callbackProbeMaxAgeHours = Number(seoPolicy.feedbackLoop.callbackProbeMaxAgeHours);
  let callbackHandshake;
  try {
    callbackHandshake = await readNovelAiIntegrationProbe();
  } catch (error) {
    callbackHandshake = {
      state: "unavailable" as const,
      lastObservedAt: null,
      probeId: null,
      detail: error instanceof Error ? error.message : "NovelAI callback handshake read failed.",
    };
  }
  const callbackHandshakeAgeHours = callbackHandshake.lastObservedAt
    ? (Date.now() - Date.parse(callbackHandshake.lastObservedAt)) / 3_600_000
    : null;
  const callbackHandshakeRecent = callbackHandshake.state === "observed" &&
    callbackHandshakeAgeHours !== null &&
    callbackHandshakeAgeHours >= 0 &&
    callbackHandshakeAgeHours <= callbackProbeMaxAgeHours;
  const conversionCallback = {
    configured: Boolean(process.env.ATTRIBUTION_SECRET),
    provider: "novelai_callback" as const,
    callbackProbeMaxAgeHours,
    handshake: {
      ...callbackHandshake,
      recent: callbackHandshakeRecent,
      ageHours: callbackHandshakeAgeHours,
    },
    ...(!process.env.ATTRIBUTION_SECRET
      ? { detail: "ATTRIBUTION_SECRET is not configured." }
      : !callbackHandshakeRecent
        ? { detail: "NovelAI has not completed a recent signed callback handshake." }
      : {}),
  };
  const sourceProbeReady = probe && !("state" in probe) &&
    probe.searchConsole.state === "observed" &&
    probe.urlInspection.state === "observed" &&
    probe.landingUv.state === "observed" &&
    probe.attributionStore.state === "observed";

  return privateJson({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reportingPolicy: {
      periodBasis: "complete_shanghai_calendar_days",
      reportingWindowDays,
      reportingLagDays,
      probeDays: 1,
    },
    sources: {
      searchConsole,
      landingUv,
      attributionStore,
      conversionCallback,
    },
    probe,
    readyFor: {
      searchEvidence: Boolean(
        searchConsole.configured &&
        probe &&
        !("state" in probe) &&
        probe.searchConsole.state === "observed" &&
        probe.urlInspection.state === "observed"
      ),
      searchToUv: searchConsole.configured && landingUv.configured,
      outboundToRevenue: attributionStore.configured &&
        conversionCallback.configured &&
        callbackHandshakeRecent,
      fullLoop: Boolean(
        sourceProbeReady &&
        conversionCallback.configured &&
        callbackHandshakeRecent,
      ),
    },
  });
}
