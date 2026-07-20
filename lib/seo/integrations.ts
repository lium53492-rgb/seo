import type { IntegrationStatus } from "./types";

type IntegrationOverride = Pick<IntegrationStatus, "state" | "detail"> &
  Partial<Pick<IntegrationStatus, "lastCheckedAt" | "href" | "actionLabel">>;

type IntegrationOverrides = Partial<
  Record<IntegrationStatus["id"], IntegrationOverride>
>;

export function integrationStatuses(
  overrides: IntegrationOverrides = {},
): IntegrationStatus[] {
  const hasGoogle = Boolean(
    process.env.GSC_SITE_URL &&
      (process.env.GSC_ACCESS_TOKEN ||
        (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)),
  );
  const hasGithub = Boolean(
    process.env.GITHUB_REPORTS_TOKEN && process.env.GITHUB_REPORTS_REPO,
  );
  const hasGateway = Boolean(
    process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.VERCEL,
  );
  const hasCodexResearch = process.env.CODEX_RESEARCH_MODE === "true";
  const analyticsUrl = "https://vercel.com/elser1/seo/analytics";

  const statuses: IntegrationStatus[] = [
    {
      id: "semrush",
      name: "Semrush",
      state: process.env.SEMRUSH_API_KEY ? "configured" : "replaced",
      detail: process.env.SEMRUSH_API_KEY
        ? "凭据已配置；运行时会验证相关词、搜索量、KD、意图和趋势"
        : "已由 Codex 公开网页研究替代，不购买也能每天更新关键词机会",
    },
    {
      id: "codex_research",
      name: "Codex Research",
      state: hasCodexResearch ? "configured" : "missing",
      detail: hasCodexResearch
        ? "每日检索公开网页并保存需求、竞争代理分与证据链接"
        : "等待启用每日免费研究自动化",
    },
    {
      id: "search_console",
      name: "Google Search Console",
      state: hasGoogle ? "configured" : "missing",
      detail: hasGoogle
        ? "凭据已配置；运行时会读取近 28 天 query × page 搜索表现"
        : "等待站点授权与服务账号；未连接时显示空数据",
      href: "https://search.google.com/search-console",
      actionLabel: hasGoogle ? "打开 Search Console" : "去 Google 授权",
    },
    {
      id: "ai_gateway",
      name: "Codex Content",
      state: hasGateway ? "configured" : "missing",
      detail: hasGateway
        ? "运行时选择可用模型并生成结构化、可追踪的英文页面草稿"
        : "等待 Vercel OIDC 或 AI_GATEWAY_API_KEY；没有模型权限就不生成伪草稿",
    },
    {
      id: "github",
      name: "GitHub Reports",
      state: hasGithub || hasCodexResearch ? "connected" : "missing",
      detail: hasGithub
        ? "日报可由服务端写入仓库 data/reports 目录"
        : hasCodexResearch
          ? "Codex 每日自动化已将研究与日报提交到 GitHub"
          : "等待细粒度 Contents 权限，用于持久保存日报",
      href: "https://github.com/lium53492-rgb/seo/tree/main/data/reports",
      actionLabel: "查看日报文件",
    },
    {
      id: "product_analytics",
      name: "Product Analytics",
      state: process.env.PRODUCT_ANALYTICS_API_URL ? "connected" : "configured",
      detail: process.env.PRODUCT_ANALYTICS_API_URL
        ? "可回传开始语音、注册与留存数据"
        : "Vercel 页面访问采集代码已接入；需在控制台启用，Hobby 免费版不含自定义事件",
      href: analyticsUrl,
      actionLabel: process.env.PRODUCT_ANALYTICS_API_URL ? "查看统计" : "启用免费统计",
    },
  ];

  return statuses.map((status) => ({
    ...status,
    ...(overrides[status.id] ?? {}),
  }));
}
