import type { IntegrationStatus } from "./types";

type IntegrationOverride = Pick<IntegrationStatus, "state" | "detail"> & {
  lastCheckedAt?: string;
};

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

  const statuses: IntegrationStatus[] = [
    {
      id: "semrush",
      name: "Semrush",
      state: process.env.SEMRUSH_API_KEY ? "configured" : "missing",
      detail: process.env.SEMRUSH_API_KEY
        ? "凭据已配置；运行时会验证相关词、搜索量、KD、意图和趋势"
        : "等待 SEMRUSH_API_KEY；不会用演示关键词代替真实结果",
    },
    {
      id: "search_console",
      name: "Google Search Console",
      state: hasGoogle ? "configured" : "missing",
      detail: hasGoogle
        ? "凭据已配置；运行时会读取近 28 天 query × page 搜索表现"
        : "等待站点授权与服务账号；未连接时显示空数据",
    },
    {
      id: "ai_gateway",
      name: "Vercel AI Gateway",
      state: hasGateway ? "configured" : "missing",
      detail: hasGateway
        ? "运行时选择可用模型并生成结构化、可追踪的英文页面草稿"
        : "等待 Vercel OIDC 或 AI_GATEWAY_API_KEY；没有模型权限就不生成伪草稿",
    },
    {
      id: "github",
      name: "GitHub Reports",
      state: hasGithub ? "configured" : "missing",
      detail: hasGithub
        ? "日报将写入仓库 data/reports 目录"
        : "等待细粒度 Contents 权限，用于持久保存日报",
    },
    {
      id: "product_analytics",
      name: "Product Analytics",
      state: process.env.PRODUCT_ANALYTICS_API_URL ? "configured" : "missing",
      detail: process.env.PRODUCT_ANALYTICS_API_URL
        ? "可回传开始语音、注册与留存数据"
        : "尚未接入产品事件；当前优化目标止于 SEO 点击",
    },
  ];

  return statuses.map((status) => ({
    ...status,
    ...(overrides[status.id] ?? {}),
  }));
}
