import "server-only";

import { buildPageBrief } from "./brief";
import { generatePageDraft } from "./content-generator";
import { integrationStatuses } from "./integrations";
import { fetchSearchConsolePerformance } from "./providers/search-console";
import { fetchSemrushCandidates } from "./providers/semrush";
import { scoreCandidates } from "./scoring";
import type {
  DailyAction,
  DailySeoReport,
  IntegrationStatus,
  PagePerformance,
} from "./types";

type PipelineOptions = {
  live?: boolean;
  generateContent?: boolean;
  strict?: boolean;
};

type IntegrationOverride = {
  state: IntegrationStatus["state"];
  detail: string;
  lastCheckedAt?: string;
};

export class PipelinePrerequisiteError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Production run blocked: ${issues.join("; ")}`);
    this.name = "PipelinePrerequisiteError";
    this.issues = issues;
  }
}

function formatShanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildActions(
  report: Pick<DailySeoReport, "opportunities" | "performance">,
): DailyAction[] {
  const top = report.opportunities[0];
  if (!top) {
    return [
      {
        priority: "P0",
        action: "连接并验证真实数据源",
        why: "当前没有可用于决策的真实关键词结果。",
        expectedImpact: "避免把演示数字或猜测内容误当成生产建议。",
      },
    ];
  }

  const performanceAction = report.performance
    .filter((row) => row.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)[0];
  const actions: DailyAction[] = [
    {
      priority: "P0",
      action:
        top.action === "improve_page"
          ? `升级 ${top.existingUrl} 对应页面，吸收“${top.keyword}”的需求`
          : `为“${top.keyword}”生成事实受控的英文页面草稿`,
      why: top.reason,
      expectedImpact: "把最高质量的真实搜索机会转成可审核、可部署的页面任务。",
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
    action: "人工确认剧情、角色、语音能力与原创素材后再发布",
    why: "结构化生成只能使用已批准事实，不能替代第一手产品证据。",
    expectedImpact: "降低规模化低价值内容和虚假产品承诺的风险。",
  });
  return actions;
}

function summary(performance: PagePerformance[]) {
  return performance.reduce(
    (result, row) => ({
      clicks: result.clicks + row.clicks,
      impressions: result.impressions + row.impressions,
    }),
    { clicks: 0, impressions: 0 },
  );
}

export function createDisconnectedReport(): DailySeoReport {
  const date = formatShanghaiDate();
  return {
    id: `seo-${date}`,
    date,
    generatedAt: new Date().toISOString(),
    mode: "disconnected",
    headline: "等待真实数据连接",
    summary: {
      candidatesAnalyzed: 0,
      publishableOpportunities: 0,
      totalClicks: 0,
      totalImpressions: 0,
      averageCtr: 0,
    },
    opportunities: [],
    performance: [],
    actions: buildActions({ opportunities: [], performance: [] }),
    brief: null,
    draft: null,
    integrations: integrationStatuses(),
    evidence: [],
    caveats: ["当前没有读取到已持久化的真实日报；页面不会回退到演示数据。"],
  };
}

export async function runDailySeoPipeline(
  options: PipelineOptions = {},
): Promise<DailySeoReport> {
  const caveats: string[] = [];
  const blockers: string[] = [];
  const checkedAt = new Date().toISOString();
  const overrides: Partial<Record<IntegrationStatus["id"], IntegrationOverride>> = {};
  let keywordRows: Awaited<ReturnType<typeof fetchSemrushCandidates>> = [];
  let performance: PagePerformance[] = [];
  let semrushSucceeded = false;
  let searchConsoleSucceeded = false;

  if (!options.live) return createDisconnectedReport();

  if (!process.env.SEMRUSH_API_KEY) {
    blockers.push("SEMRUSH_API_KEY is missing");
    caveats.push("Semrush 未连接，因此没有关键词指标或机会评分。 ");
  } else {
    try {
      keywordRows = await fetchSemrushCandidates();
      semrushSucceeded = keywordRows.length > 0;
      if (!semrushSucceeded) blockers.push("Semrush returned no keyword rows");
      overrides.semrush = {
        state: semrushSucceeded ? "connected" : "error",
        detail: semrushSucceeded
          ? `已验证 ${keywordRows.length} 个真实关键词结果`
          : "API 调用成功但没有返回可评分关键词",
        lastCheckedAt: checkedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Semrush 数据获取失败";
      blockers.push(message);
      caveats.push(message);
      overrides.semrush = {
        state: "error",
        detail: message,
        lastCheckedAt: checkedAt,
      };
    }
  }

  const hasGoogleCredentials = Boolean(
    process.env.GSC_ACCESS_TOKEN ||
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
  );
  if (!process.env.GSC_SITE_URL || !hasGoogleCredentials) {
    blockers.push(
      !process.env.GSC_SITE_URL
        ? "GSC_SITE_URL is missing"
        : "Google Search Console credentials are missing",
    );
    caveats.push("Google Search Console 未连接，因此搜索表现保持为空。 ");
  } else {
    try {
      performance = await fetchSearchConsolePerformance();
      searchConsoleSucceeded = true;
      overrides.search_console = {
        state: "connected",
        detail: performance.length
          ? `已验证 ${performance.length} 行 query × page 真实表现`
          : "连接已验证；当前 28 天窗口没有可返回的搜索行",
        lastCheckedAt: checkedAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Search Console 数据获取失败";
      blockers.push(message);
      caveats.push(message);
      overrides.search_console = {
        state: "error",
        detail: message,
        lastCheckedAt: checkedAt,
      };
    }
  }

  if (options.strict && blockers.length) {
    throw new PipelinePrerequisiteError(blockers);
  }

  const opportunities = scoreCandidates(keywordRows).slice(0, 12);
  const top = opportunities[0];
  const brief = top ? buildPageBrief(top) : null;
  let draft: DailySeoReport["draft"] = null;

  if (options.generateContent && top && brief) {
    try {
      draft = await generatePageDraft(top, brief);
      overrides.ai_gateway = {
        state: "connected",
        detail: `已用 ${draft.model} 生成草稿；质检状态 ${draft.status}`,
        lastCheckedAt: checkedAt,
      };
      if (!draft.quality.passed) {
        caveats.push("AI 草稿未通过全部质量检查，已阻止进入发布流程。 ");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 内容生成失败";
      caveats.push(message);
      overrides.ai_gateway = {
        state: "error",
        detail: message,
        lastCheckedAt: checkedAt,
      };
      if (options.strict) throw new PipelinePrerequisiteError([message]);
    }
  }

  const totals = summary(performance);
  const date = formatShanghaiDate();
  const mode =
    semrushSucceeded && searchConsoleSucceeded
      ? "live"
      : semrushSucceeded || searchConsoleSucceeded
        ? "partial"
        : "disconnected";
  const base = { opportunities, performance };

  return {
    id: `seo-${date}`,
    date,
    generatedAt: new Date().toISOString(),
    mode,
    headline: top
      ? `今日优先动作：${top.action === "improve_page" ? "升级" : "创建"}“${top.keyword}”`
      : "没有足够的真实关键词数据生成今日任务",
    summary: {
      candidatesAnalyzed: keywordRows.length,
      publishableOpportunities: opportunities.filter((row) => row.score >= 62).length,
      totalClicks: totals.clicks,
      totalImpressions: totals.impressions,
      averageCtr: totals.impressions ? totals.clicks / totals.impressions : 0,
    },
    ...base,
    actions: buildActions(base),
    brief,
    draft,
    integrations: integrationStatuses(overrides),
    evidence: [],
    caveats,
  };
}
