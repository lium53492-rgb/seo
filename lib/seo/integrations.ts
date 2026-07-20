import type { IntegrationStatus } from "./types";

export function integrationStatuses(): IntegrationStatus[] {
  const hasGoogle = Boolean(
    process.env.GSC_SITE_URL &&
      (process.env.GSC_ACCESS_TOKEN ||
        (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)),
  );
  const hasGithub = Boolean(
    process.env.GITHUB_REPORTS_TOKEN && process.env.GITHUB_REPORTS_REPO,
  );

  return [
    {
      id: "semrush",
      name: "Semrush",
      state: process.env.SEMRUSH_API_KEY ? "connected" : "demo",
      detail: process.env.SEMRUSH_API_KEY
        ? "每日拉取相关词、搜索量、KD、意图和趋势"
        : "等待 SEMRUSH_API_KEY；当前使用标记过的演示候选词",
    },
    {
      id: "search_console",
      name: "Google Search Console",
      state: hasGoogle ? "connected" : "demo",
      detail: hasGoogle
        ? "读取近 28 天 query × page 搜索表现"
        : "等待站点授权与服务账号；当前使用演示表现数据",
    },
    {
      id: "github",
      name: "GitHub Reports",
      state: hasGithub ? "connected" : "missing",
      detail: hasGithub
        ? "日报将写入仓库 data/reports 目录"
        : "等待细粒度 Contents 权限，用于持久保存日报",
    },
    {
      id: "product_analytics",
      name: "Product Analytics",
      state: process.env.PRODUCT_ANALYTICS_API_URL ? "connected" : "missing",
      detail: process.env.PRODUCT_ANALYTICS_API_URL
        ? "可回传开始语音、注册与留存数据"
        : "尚未接入产品事件；当前优化目标止于 SEO 点击",
    },
  ];
}
