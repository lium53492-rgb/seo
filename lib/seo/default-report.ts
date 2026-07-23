import type { DailySeoReport, ObservedMetric, SeoGrowthFunnel } from "./types";

function shanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function unavailableMetric(source: ObservedMetric["source"], detail: string): ObservedMetric {
  return { status: "unavailable", value: null, source, detail };
}

export function createUnavailableFunnel(date = shanghaiDate()): SeoGrowthFunnel {
  return {
    schemaVersion: 1,
    attributionStatus: "unavailable",
    aggregationKey: "source_slug+reporting_period",
    conversionJoinKey: "seo_click_id",
    periodStart: `${date}T00:00:00+08:00`,
    periodEnd: `${date}T23:59:59+08:00`,
    metrics: {
      organicClicks: unavailableMetric("search_console", "Search Console has not returned a visible row."),
      landingUv: unavailableMetric("vercel_analytics", "Vercel Web Analytics has not been copied into this report."),
      qualifiedOutboundClicks: unavailableMetric("seo_redirect", "The outbound redirect event has not been aggregated."),
      trialStarts: unavailableMetric("product_analytics", "NovelAI trial callbacks are not connected."),
      signups: unavailableMetric("product_analytics", "NovelAI signup callbacks are not connected."),
      paidConversions: unavailableMetric("payments", "Payment attribution is not connected."),
      revenueMinor: unavailableMetric("payments", "Attributed revenue is not connected."),
    },
  };
}

export function createDisconnectedReport(): DailySeoReport {
  const date = shanghaiDate();
  return {
    id: `seo-${date}`,
    date,
    generatedAt: new Date().toISOString(),
    mode: "disconnected",
    headline: "Waiting for a verified revenue-first research report",
    summary: {
      candidatesAnalyzed: 0,
      publishableOpportunities: 0,
      totalClicks: 0,
      totalImpressions: 0,
      averageCtr: 0,
    },
    opportunities: [],
    performance: [],
    funnel: createUnavailableFunnel(date),
    actions: [{
      priority: "P0",
      action: "Run the verified local research workflow",
      why: "No persisted report is available, so the workbench will not substitute demo data.",
      expectedImpact: "Keep research proxies and observed business outcomes auditable.",
    }],
    brief: null,
    draft: null,
    publication: { status: "not_requested", reason: "No verified report is available." },
    integrations: [
      { id: "codex_research", name: "Codex Research", state: "missing", detail: "No verified daily report is available." },
      { id: "search_console", name: "Google Search Console", state: "missing", detail: "No observed query/page rows are available." },
      { id: "product_analytics", name: "Revenue Attribution", state: "missing", detail: "Trial and payment callbacks are not connected." },
      { id: "github", name: "GitHub Reports", state: "configured", detail: "Verified reports are stored in the repository." },
      { id: "semrush", name: "SEO Research Tools", state: "configured", detail: "Shared research access is available for manual evidence collection." },
      { id: "ai_gateway", name: "Codex Content", state: "configured", detail: "Content generation waits for a verified research input." },
    ],
    evidence: [],
    caveats: ["No verified daily report was found; no metric has been inferred."],
  };
}

export function redactPrivateReportData(report: DailySeoReport): DailySeoReport {
  const funnel = report.funnel;
  if (!funnel) return { ...report, draft: null, drafts: [] };
  return {
    ...report,
    draft: null,
    drafts: [],
    funnel: {
      ...funnel,
      attributionStatus: "unavailable",
      metrics: {
        ...funnel.metrics,
        landingUv: unavailableMetric("vercel_analytics", "Protected metric. Configure workbench authentication to view it."),
        qualifiedOutboundClicks: unavailableMetric("seo_redirect", "Protected metric. Configure workbench authentication to view it."),
        trialStarts: unavailableMetric("product_analytics", "Protected metric. Configure workbench authentication to view it."),
        signups: unavailableMetric("product_analytics", "Protected metric. Configure workbench authentication to view it."),
        paidConversions: unavailableMetric("payments", "Protected metric. Configure workbench authentication to view it."),
        revenueMinor: unavailableMetric("payments", "Protected metric. Configure workbench authentication to view it."),
      },
      currency: undefined,
    },
    caveats: [
      ...report.caveats,
      "Drafts and conversion metrics are hidden until WORKBENCH_PASSWORD is configured.",
    ],
  };
}
