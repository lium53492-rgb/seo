import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import { readLiveGrowthFunnel, unavailableLiveGrowthFunnel, type LiveGrowthFunnel } from "@/lib/seo/growth-funnel";
import { listPublishedPages } from "@/lib/seo/page-store";
import { shanghaiReportingWindow } from "@/lib/seo/reporting-period";
import type { ObservedMetric } from "@/lib/seo/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "营收归因 | Growth OS",
  robots: { index: false, follow: false },
};

function metricValue(metric: ObservedMetric, currency?: string) {
  if (metric.status !== "observed" || metric.value === null) return "—";
  if (metric.source === "payments" && currency) {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(metric.value / 100);
  }
  return metric.value.toLocaleString("zh-CN");
}

function rate(numerator: ObservedMetric, denominator: ObservedMetric) {
  if (numerator.status !== "observed" || denominator.status !== "observed" || numerator.value === null || !denominator.value) return "—";
  return `${((numerator.value / denominator.value) * 100).toFixed(1)}%`;
}

function revenueValue(growth: LiveGrowthFunnel) {
  const currencies = Object.entries(growth.revenueByCurrency).sort(([left], [right]) => left.localeCompare(right));
  if (currencies.length) {
    return currencies.map(([currency, minor]) => (
      new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(minor / 100)
    )).join(" + ");
  }
  return metricValue(growth.funnel.metrics.revenueMinor, growth.funnel.currency);
}

export default async function WorkbenchAttributionPage() {
  const requestHeaders = await headers();
  if (!isBasicAuthHeaderAuthorized(requestHeaders.get("authorization"))) notFound();

  const period = shanghaiReportingWindow(30);
  const pages = await listPublishedPages();
  const rows = await Promise.all(pages.map(async (page) => {
    try {
      return {
        page,
        growth: await readLiveGrowthFunnel({ sourceSlug: page.slug, ...period }),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Attribution data could not be read.";
      return {
        page,
        growth: unavailableLiveGrowthFunnel({ sourceSlug: page.slug, detail, ...period }),
      };
    }
  }));

  return (
    <main className="wb-shell">
      <aside className="wb-sidebar">
        <a className="wb-brand" href="/workbench" aria-label="返回 SEO Growth OS">
          <span className="wb-brand-mark">N</span>
          <span><strong>Growth OS</strong><small>NovelAI SEO</small></span>
        </a>
        <nav className="wb-nav" aria-label="营收归因导航">
          <a href="/workbench"><span>←</span>返回工作台</a>
          <a className="active" href="/workbench/attribution"><span>↗</span>营收归因</a>
          <a href="/workbench/reports"><span>▤</span>日报归档</a>
          <a href="/workbench/guide"><span>?</span>使用指南</a>
        </nav>
        <div className="wb-sidebar-note"><span className="wb-dot partial" /><p><strong>近 30 天</strong><small>按获客页面与上海日期聚合</small></p></div>
      </aside>

      <div className="wb-main wb-reports">
        <header className="wb-topbar">
          <div><p className="wb-kicker">UV → OUTBOUND → REVENUE</p><h1>每个页面都用真实业务结果接受检验。</h1></div>
          <div className="wb-top-actions"><a className="wb-guide-link" href="/workbench">返回今日工作台</a></div>
        </header>
        <p className="wb-report-intro">落地页 UV 来自 Vercel Web Analytics；出站、试玩、注册、付费和营收来自持久化归因事件。搜索点击仍由 Search Console 按相同页面和周期单独导入，不进行虚假的用户级拼接。</p>

        {rows.length ? <div className="wb-table-wrap"><table><thead><tr>
          <th>SEO 页面</th><th>UV</th><th>有效出站</th><th>出站率</th><th>试玩</th><th>注册</th><th>付费</th><th>归因营收</th><th>状态</th>
        </tr></thead><tbody>{rows.map(({ page, growth }, index) => {
          const funnel = growth.funnel;
          return <tr key={page.slug}>
            <td><span className="wb-rank">{String(index + 1).padStart(2, "0")}</span><strong>{page.keyword}</strong><small>/{page.slug}</small></td>
            <td>{metricValue(funnel.metrics.landingUv)}</td>
            <td>{metricValue(funnel.metrics.qualifiedOutboundClicks)}</td>
            <td>{rate(funnel.metrics.qualifiedOutboundClicks, funnel.metrics.landingUv)}</td>
            <td>{metricValue(funnel.metrics.trialStarts)}</td>
            <td>{metricValue(funnel.metrics.signups)}</td>
            <td>{metricValue(funnel.metrics.paidConversions)}</td>
            <td>{revenueValue(growth)}</td>
            <td><span className={`wb-mode-badge ${funnel.attributionStatus === "connected" ? "live" : "partial"}`}>{funnel.attributionStatus}</span></td>
          </tr>;
        })}</tbody></table></div> : <div className="wb-empty-state">当前没有已发布且可归因的 SEO 页面。</div>}

        <section className="wb-section">
          <div className="wb-section-heading"><div><p className="wb-kicker">DATA CONTRACT</p><h2>哪些数字可用，哪些缺口仍然存在。</h2></div></div>
          <div className="wb-report-archive">{rows.map(({ page, growth }) => <article className="wb-report-card" key={`status-${page.slug}`}>
            <div className="wb-report-card-head"><div><p className="wb-kicker">/{page.slug}</p><h2>{page.title}</h2></div><span className={`wb-mode-badge ${growth.funnel.attributionStatus === "connected" ? "live" : "partial"}`}>{growth.funnel.attributionStatus}</span></div>
            <p>{growth.funnel.metrics.landingUv.detail}</p>
            <p>{growth.funnel.metrics.qualifiedOutboundClicks.detail}</p>
            {growth.orphanCallbacks ? <p><strong>{growth.orphanCallbacks}</strong> 个回调没有匹配到原始出站事件，已保留但标记为孤立归因。</p> : null}
            <div className="wb-report-links"><a href={`/${page.slug}`}>打开页面</a><a href={`/api/attribution/report?sourceSlug=${encodeURIComponent(page.slug)}&from=${encodeURIComponent(period.periodStart)}&to=${encodeURIComponent(period.periodEnd)}`}>查看 JSON</a></div>
          </article>)}</div>
        </section>
      </div>
    </main>
  );
}
