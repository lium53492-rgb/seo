import {
  isPrivateAttributionAccessConfigured,
  isPrivateAttributionRequestAuthorized,
} from "@/lib/seo/auth";
import seoPolicy from "@/data/config/seo-policy.json";
import {
  attributionStoreStatus,
  readPlayworldsCallbackHealth,
  readPlayworldsIntegrationProbe,
} from "@/lib/seo/attribution-store";
import { readLiveGrowthFunnel } from "@/lib/seo/growth-funnel";
import { listPublishedPages } from "@/lib/seo/page-store";
import { privateJson } from "@/lib/seo/private-response";
import { shanghaiReportingWindow } from "@/lib/seo/reporting-period";
import { searchConsoleStatus } from "@/lib/seo/search-console";
import { landingAnalyticsStatus } from "@/lib/seo/landing-analytics";
import {
  evaluatePlayworldsAttributionJoin,
  evaluatePlayworldsFullLoopReadiness,
  playworldsCallbackContract,
  playworldsCallbackReceiverStatus,
} from "@/lib/seo/playworlds-callback";

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
          orphanCallbacks: growth.orphanCallbacks,
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
    provider: "landing_analytics",
    label: "Landing analytics",
    read: landingAnalyticsStatus,
  });
  const attributionStore = readSourceStatus({
    provider: "upstash_redis",
    label: "Attribution store",
    read: attributionStoreStatus,
  });
  const callbackProbeMaxAgeHours = Number(seoPolicy.feedbackLoop.callbackProbeMaxAgeHours);
  const callbackReceiver = playworldsCallbackReceiverStatus();
  const callbackConfigured = callbackReceiver.configured && attributionStore.configured;
  let callbackHandshake: {
    state: "observed" | "unavailable";
    lastObservedAt: string | null;
    probeId: string | null;
    recent: boolean;
    ageHours: number | null;
    detail: string;
  } = {
    state: "unavailable",
    lastObservedAt: null,
    probeId: null,
    recent: false,
    ageHours: null,
    detail: !callbackReceiver.configured
      ? callbackReceiver.detail
      : !attributionStore.configured
        ? attributionStore.detail ?? "The attribution store is not configured."
        : "Playworlds has not completed a recent signed callback handshake.",
  };
  let callbackHealth: Awaited<ReturnType<typeof readPlayworldsCallbackHealth>> = {
    state: "unavailable",
    acceptedCallbacks: null,
    orphanCallbacks: null,
    lastAcceptedAt: null,
    detail: callbackHandshake.detail,
  };
  if (callbackConfigured) {
    try {
      const [storedHandshake, storedHealth] = await Promise.all([
        readPlayworldsIntegrationProbe(),
        readPlayworldsCallbackHealth(),
      ]);
      callbackHealth = storedHealth;
      if (storedHandshake.state === "observed" && storedHandshake.lastObservedAt) {
        const nowMs = Date.now();
        const lastObservedMs = Date.parse(storedHandshake.lastObservedAt);
        const ageHours = (nowMs - lastObservedMs) / 3_600_000;
        const recent = Number.isFinite(ageHours) &&
          ageHours >= -(playworldsCallbackContract.signature.maximumClockSkewSeconds / 3_600) &&
          ageHours <= callbackProbeMaxAgeHours;
        callbackHandshake = {
          ...storedHandshake,
          recent,
          ageHours: Number.isFinite(ageHours) ? Math.max(0, ageHours) : null,
          detail: recent
            ? storedHandshake.detail
            : "The last signed Playworlds callback handshake is missing, stale, or dated too far in the future.",
        };
      } else {
        callbackHandshake = {
          ...storedHandshake,
          recent: false,
          ageHours: null,
        };
      }
    } catch (error) {
      const detail = `Playworlds callback readiness check failed: ${
        error instanceof Error && error.message ? error.message : "unknown error"
      }`;
      callbackHandshake = {
        state: "unavailable",
        lastObservedAt: null,
        probeId: null,
        recent: false,
        ageHours: null,
        detail,
      };
      callbackHealth = {
        state: "unavailable",
        acceptedCallbacks: null,
        orphanCallbacks: null,
        lastAcceptedAt: null,
        detail,
      };
    }
  }
  const callbackHandshakeRecent = callbackHandshake.state === "observed" && callbackHandshake.recent;
  const attributionJoin = evaluatePlayworldsAttributionJoin({
    blockOnOrphanCallbacks: seoPolicy.feedbackLoop.blockOnOrphanCallbacks === true,
    orphanCallbacks: callbackHealth.state === "observed"
      ? callbackHealth.orphanCallbacks
      : null,
  });
  const conversionCallback = {
    configured: callbackConfigured,
    provider: "playworlds_callback" as const,
    callbackProbeMaxAgeHours,
    handshake: callbackHandshake,
    detail: callbackConfigured
      ? callbackHandshakeRecent
        ? "The signed Playworlds receiver and a recent product-side handshake are configured."
        : "The signed Playworlds receiver is configured, but a recent product-side handshake is unavailable."
      : `Playworlds callback readiness is unavailable: ${callbackHandshake.detail}`,
  };
  const sourceProbeReady = probe && !("state" in probe) &&
    probe.searchConsole.state === "observed" &&
    probe.urlInspection.state === "observed" &&
    probe.landingUv.state === "observed" &&
    probe.attributionStore.state === "observed" &&
    attributionJoin.ready;
  const searchToUvReady = probe && !("state" in probe) &&
    probe.searchConsole.state === "observed" &&
    probe.landingUv.state === "observed";

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
    attributionJoin: {
      policy: seoPolicy.feedbackLoop.blockOnOrphanCallbacks === true
        ? "block_on_orphan_callbacks"
        : "observe_orphan_callbacks",
      ...attributionJoin,
      healthState: callbackHealth.state,
      acceptedCallbacks: callbackHealth.acceptedCallbacks,
      lastAcceptedAt: callbackHealth.lastAcceptedAt,
      detail: callbackHealth.detail,
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
      searchToUv: Boolean(searchToUvReady),
      outboundToRevenue: attributionStore.configured &&
        conversionCallback.configured &&
        callbackHandshakeRecent &&
        attributionJoin.ready,
      fullLoop: evaluatePlayworldsFullLoopReadiness({
        sourceProbeReady: Boolean(sourceProbeReady),
        conversionCallbackConfigured: conversionCallback.configured,
        callbackHandshakeRecent,
        attributionJoinReady: attributionJoin.ready,
      }),
    },
  });
}
