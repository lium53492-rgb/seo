import "server-only";

import { buildPageBrief } from "./brief";
import { demoKeywordCandidates, demoPagePerformance } from "./demo-data";
import { integrationStatuses } from "./integrations";
import { fetchSearchConsolePerformance } from "./providers/search-console";
import { fetchSemrushCandidates } from "./providers/semrush";
import { scoreCandidates } from "./scoring";
import type { DailyAction, DailySeoReport } from "./types";

type PipelineOptions = { live?: boolean };

function formatShanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildActions(report: Pick<DailySeoReport, "opportunities" | "performance">): DailyAction[] {
  const top = report.opportunities[0];
  const performanceAction = report.performance
    .filter((row) => row.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)[0];
  const actions: DailyAction[] = [
    {
      priority: "P0",
      action:
        top.action === "improve_page"
          ? `升级 ${top.existingUrl} 对应页面，吸收 “${top.keyword}” 的需求`
          : `生成 “${top.keyword}” 页面预览与产品事实清单`,
      why: top.reason,
      expectedImpact: "把最高质量的搜索机会转成可审核、可部署的页面任务。",
    },
  ];

  if (performanceAction) {
    actions.push({
      priority: "P1",
      action: `优化 ${performanceAction.url}：${performanceAction.recommendedAction}`,
      why: `${performanceAction.impressions} 次曝光，CTR ${(performanceAction.ctr * 100).toFixed(1)}%，平均排名 ${performanceAction.position.toFixed(1)}。`,
      expectedImpact: "优先利用已有曝光，而不是只制造新页面。",
    });
  }
  actions.push({
    priority: "P2",
    action: "补齐真实剧情、角色和语音素材后再允许自动发布",
    why: "工作台不会用通用 AI 文字替代第一手产品证据。",
    expectedImpact: "降低规模化低价值内容风险，提高页面转化与长期排名质量。",
  });
  return actions;
}

export async function runDailySeoPipeline(
  options: PipelineOptions = {},
): Promise<DailySeoReport> {
  const caveats: string[] = [];
  let keywordRows = demoKeywordCandidates;
  let performance = demoPagePerformance;
  let usedSemrush = false;
  let usedSearchConsole = false;

  if (options.live && process.env.SEMRUSH_API_KEY) {
    try {
      const live = await fetchSemrushCandidates();
      if (live.length) {
        keywordRows = live;
        usedSemrush = true;
      }
    } catch (error) {
      caveats.push(error instanceof Error ? error.message : "Semrush 数据获取失败");
    }
  }

  if (options.live && process.env.GSC_SITE_URL) {
    try {
      const live = await fetchSearchConsolePerformance();
      if (live.length) {
        performance = live;
        usedSearchConsole = true;
      }
    } catch (error) {
      caveats.push(error instanceof Error ? error.message : "Search Console 数据获取失败");
    }
  }

  if (!usedSemrush) caveats.push("关键词指标为演示数据，不代表真实 Semrush 结果。");
  if (!usedSearchConsole) caveats.push("搜索表现为演示数据，不代表真实 Search Console 结果。");

  const opportunities = scoreCandidates(keywordRows).slice(0, 12);
  const totals = performance.reduce(
    (result, row) => ({
      clicks: result.clicks + row.clicks,
      impressions: result.impressions + row.impressions,
    }),
    { clicks: 0, impressions: 0 },
  );
  const date = formatShanghaiDate();
  const base = {
    opportunities,
    performance,
  };
  const report: DailySeoReport = {
    id: `seo-${date}`,
    date,
    generatedAt: new Date().toISOString(),
    mode: usedSemrush && usedSearchConsole ? "live" : usedSemrush || usedSearchConsole ? "partial" : "demo",
    headline: `今日优先动作：${opportunities[0].action === "improve_page" ? "升级" : "创建"} “${opportunities[0].keyword}”`,
    summary: {
      candidatesAnalyzed: keywordRows.length,
      publishableOpportunities: opportunities.filter((row) => row.score >= 62).length,
      totalClicks: totals.clicks,
      totalImpressions: totals.impressions,
      averageCtr: totals.impressions ? totals.clicks / totals.impressions : 0,
    },
    ...base,
    actions: buildActions(base),
    brief: buildPageBrief(opportunities[0]),
    integrations: integrationStatuses(),
    caveats,
  };
  return report;
}
