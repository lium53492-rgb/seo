import seoPolicy from "../../data/config/seo-policy.json" with { type: "json" };
import {
  readAttributionAggregate,
  readPlayworldsIntegrationProbe,
  type AttributionAggregate,
  type PlayworldsIntegrationProbeStatus,
} from "./attribution-store";
import { normalizeShanghaiReportingPeriod } from "./reporting-period";
import {
  readSearchConsolePagePerformance,
  readSearchConsoleUrlInspection,
  type SearchConsolePagePerformance,
  type SearchConsoleUrlInspection,
} from "./search-console";
import { absoluteSiteUrl } from "./site";
import type { ObservedMetric, SeoGrowthFunnel } from "./types";
import { landingAnalyticsStatus, readLandingAnalytics } from "./landing-analytics";
import {
  playworldsCallbackContract,
  playworldsCallbackReceiverStatus,
} from "./playworlds-callback";

function observedMetric(
  source: ObservedMetric["source"],
  value: number,
  detail: string,
): ObservedMetric {
  return { status: "observed", value, source, detail };
}

function unavailableMetric(
  source: ObservedMetric["source"],
  detail: string,
): ObservedMetric {
  return { status: "unavailable", value: null, source, detail };
}

function storeMetric(
  aggregate: AttributionAggregate,
  name: "qualifiedOutboundClicks" | "trialStarts" | "signups" | "paidConversions",
  source: ObservedMetric["source"],
): ObservedMetric {
  if (aggregate.state !== "observed" || aggregate[name] === null) {
    return unavailableMetric(source, aggregate.detail);
  }
  return observedMetric(source, aggregate[name], aggregate.detail);
}

export type LiveGrowthFunnel = {
  funnel: SeoGrowthFunnel;
  sourceSlug: string;
  pageviews: number | null;
  outboundRequests: number | null;
  purchaseEvents: number | null;
  orphanCallbacks: number | null;
  revenueByCurrency: Record<string, number>;
  ctaLocations: Record<string, number>;
  searchPerformance: SearchConsolePagePerformance;
  urlInspection: SearchConsoleUrlInspection;
};

export async function readLiveGrowthFunnel(input: {
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
  organicClicks?: ObservedMetric;
}): Promise<LiveGrowthFunnel> {
  const period = normalizeShanghaiReportingPeriod(input);
  const reportingInput = { ...input, ...period };
  const callbackReceiver = playworldsCallbackReceiverStatus();
  const callbackPromise: Promise<PlayworldsIntegrationProbeStatus> = callbackReceiver.configured
    ? readPlayworldsIntegrationProbe().catch((error) => ({
        state: "unavailable" as const,
        lastObservedAt: null,
        probeId: null,
        detail: `Playworlds callback handshake could not be read: ${
          error instanceof Error && error.message ? error.message : "unknown error"
        }`,
      }))
    : Promise.resolve({
        state: "unavailable" as const,
        lastObservedAt: null,
        probeId: null,
        detail: callbackReceiver.detail,
      });
  const [aggregate, landing, searchPerformance, urlInspection, callbackProbe] = await Promise.all([
    readAttributionAggregate(reportingInput),
    readLandingAnalytics(reportingInput),
    readSearchConsolePagePerformance(reportingInput),
    readSearchConsoleUrlInspection({ sourceSlug: input.sourceSlug }),
    callbackPromise,
  ]);
  const callbackAgeHours = callbackProbe.lastObservedAt
    ? (Date.now() - Date.parse(callbackProbe.lastObservedAt)) / 3_600_000
    : Number.NaN;
  const callbackReady = callbackReceiver.configured &&
    callbackProbe.state === "observed" &&
    Number.isFinite(callbackAgeHours) &&
    callbackAgeHours >= -(
      playworldsCallbackContract.signature.maximumClockSkewSeconds / 3_600
    ) &&
    callbackAgeHours <= Number(seoPolicy.feedbackLoop.callbackProbeMaxAgeHours);
  const callbackUnavailableDetail = callbackReady
    ? callbackProbe.detail
    : callbackProbe.state === "observed"
      ? "The signed Playworlds callback handshake is stale, so downstream conversion metrics remain unavailable."
      : callbackProbe.detail;
  const currencies = Object.keys(aggregate.revenueByCurrency).sort();
  const currency = currencies.length === 1 ? currencies[0] : undefined;
  const revenueMinor = !callbackReady
    ? unavailableMetric("payments", callbackUnavailableDetail)
    : aggregate.state !== "observed"
    ? unavailableMetric("payments", aggregate.detail)
    : currencies.length > 1
      ? unavailableMetric("payments", `Attributed revenue spans multiple currencies: ${currencies.join(", ")}.`)
      : observedMetric("payments", currency ? aggregate.revenueByCurrency[currency] : 0, aggregate.detail);
  const landingUv = landing.state === "observed" && landing.visitors !== null
    ? observedMetric(landing.source, landing.visitors, landing.detail)
    : unavailableMetric(landing.source, landing.detail);
  const organicClicks = input.organicClicks ?? (
    searchPerformance.state === "observed" && searchPerformance.clicks !== null
      ? observedMetric("search_console", searchPerformance.clicks, searchPerformance.detail)
      : unavailableMetric("search_console", searchPerformance.detail)
  );
  const qualifiedOutboundClicks = storeMetric(
    aggregate,
    "qualifiedOutboundClicks",
    "seo_redirect",
  );
  const conversionMetrics = [
    landingUv,
    qualifiedOutboundClicks,
    callbackReady
      ? storeMetric(aggregate, "trialStarts", "product_analytics")
      : unavailableMetric("product_analytics", callbackUnavailableDetail),
    callbackReady
      ? storeMetric(aggregate, "signups", "product_analytics")
      : unavailableMetric("product_analytics", callbackUnavailableDetail),
    callbackReady
      ? storeMetric(aggregate, "paidConversions", "payments")
      : unavailableMetric("payments", callbackUnavailableDetail),
    revenueMinor,
  ];
  const attributionStatus = conversionMetrics.every((metric) => metric.status === "observed")
    ? organicClicks.status === "observed" ? "connected" : "partial"
    : conversionMetrics.some((metric) => metric.status === "observed") ? "partial" : "unavailable";

  return {
    sourceSlug: input.sourceSlug,
    funnel: {
      schemaVersion: 1,
      attributionStatus,
      aggregationKey: "source_slug+reporting_period",
      conversionJoinKey: "seo_click_id",
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      metrics: {
        organicClicks,
        landingUv,
        qualifiedOutboundClicks: conversionMetrics[1],
        trialStarts: conversionMetrics[2],
        signups: conversionMetrics[3],
        paidConversions: conversionMetrics[4],
        revenueMinor,
      },
      ...(currency ? { currency } : {}),
    },
    pageviews: landing.state === "observed" ? landing.pageviews : null,
    outboundRequests: aggregate.outboundRequests,
    purchaseEvents: callbackReady ? aggregate.purchaseEvents : null,
    orphanCallbacks: callbackReady ? aggregate.orphanCallbacks : null,
    revenueByCurrency: callbackReady ? aggregate.revenueByCurrency : {},
    ctaLocations: aggregate.ctaLocations,
    searchPerformance,
    urlInspection,
  };
}

export function unavailableLiveGrowthFunnel(input: {
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
  detail: string;
}): LiveGrowthFunnel {
  const unavailableStore = unavailableMetric("product_analytics", input.detail);
  let landingSource: ObservedMetric["source"] = "first_party_analytics";
  try {
    if (landingAnalyticsStatus().provider === "vercel_web_analytics") {
      landingSource = "vercel_analytics";
    }
  } catch {
    // Keep the preferred first-party source when status inspection itself fails.
  }
  return {
    sourceSlug: input.sourceSlug,
    funnel: {
      schemaVersion: 1,
      attributionStatus: "unavailable",
      aggregationKey: "source_slug+reporting_period",
      conversionJoinKey: "seo_click_id",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      metrics: {
        organicClicks: unavailableMetric("search_console", input.detail),
        landingUv: unavailableMetric(landingSource, input.detail),
        qualifiedOutboundClicks: unavailableMetric("seo_redirect", input.detail),
        trialStarts: unavailableStore,
        signups: unavailableStore,
        paidConversions: unavailableMetric("payments", input.detail),
        revenueMinor: unavailableMetric("payments", input.detail),
      },
    },
    pageviews: null,
    outboundRequests: null,
    purchaseEvents: null,
    orphanCallbacks: null,
    revenueByCurrency: {},
    ctaLocations: {},
    searchPerformance: {
      state: "unavailable",
      sourceSlug: input.sourceSlug,
      pageUrl: "",
      startDate: input.periodStart.slice(0, 10),
      endDate: input.periodEnd.slice(0, 10),
      clicks: null,
      impressions: null,
      ctr: null,
      position: null,
      detail: input.detail,
    },
    urlInspection: {
      state: "unavailable",
      sourceSlug: input.sourceSlug,
      pageUrl: absoluteSiteUrl(`/${input.sourceSlug}`),
      inspectedAt: new Date().toISOString(),
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
    },
  };
}
