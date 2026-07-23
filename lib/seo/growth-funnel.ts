import { readAttributionAggregate, type AttributionAggregate } from "./attribution-store";
import { normalizeShanghaiReportingPeriod } from "./reporting-period";
import type { ObservedMetric, SeoGrowthFunnel } from "./types";
import { readLandingUv, type LandingUvResult } from "./vercel-analytics";

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
};

export async function readLiveGrowthFunnel(input: {
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
  organicClicks?: ObservedMetric;
}): Promise<LiveGrowthFunnel> {
  const period = normalizeShanghaiReportingPeriod(input);
  const reportingInput = { ...input, ...period };
  const [aggregate, landing] = await Promise.all([
    readAttributionAggregate(reportingInput),
    readLandingUv(reportingInput),
  ]);
  const currencies = Object.keys(aggregate.revenueByCurrency).sort();
  const currency = currencies.length === 1 ? currencies[0] : undefined;
  const revenueMinor = aggregate.state !== "observed"
    ? unavailableMetric("payments", aggregate.detail)
    : currencies.length > 1
      ? unavailableMetric("payments", `Attributed revenue spans multiple currencies: ${currencies.join(", ")}.`)
      : observedMetric("payments", currency ? aggregate.revenueByCurrency[currency] : 0, aggregate.detail);
  const landingUv = landing.state === "observed" && landing.visitors !== null
    ? observedMetric("vercel_analytics", landing.visitors, landing.detail)
    : unavailableMetric("vercel_analytics", landing.detail);
  const organicClicks = input.organicClicks ?? unavailableMetric(
    "search_console",
    "Search Console clicks must be imported separately for the same page and reporting period.",
  );
  const conversionMetrics = [
    landingUv,
    storeMetric(aggregate, "qualifiedOutboundClicks", "seo_redirect"),
    storeMetric(aggregate, "trialStarts", "product_analytics"),
    storeMetric(aggregate, "signups", "product_analytics"),
    storeMetric(aggregate, "paidConversions", "payments"),
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
    purchaseEvents: aggregate.purchaseEvents,
    orphanCallbacks: aggregate.orphanCallbacks,
    revenueByCurrency: aggregate.revenueByCurrency,
    ctaLocations: aggregate.ctaLocations,
  };
}

export function unavailableLiveGrowthFunnel(input: {
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
  detail: string;
}): LiveGrowthFunnel {
  const unavailableStore = unavailableMetric("product_analytics", input.detail);
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
        landingUv: unavailableMetric("vercel_analytics", input.detail),
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
  };
}
