import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import seoPolicy from "@/data/config/seo-policy.json";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import { createDisconnectedReport, createUnavailableFunnel, redactPrivateReportData } from "@/lib/seo/default-report";
import { readDailyPipelineStatus } from "@/lib/seo/pipeline-status";
import { readLatestReport, readReportHistory } from "@/lib/seo/report-store";
import type { DailySeoReport, GoogleTrendsDirection, GrowthPortfolioEntry, ObservedMetric, RecommendedAction } from "@/lib/seo/types";
import { FeedbackForm } from "./FeedbackForm";
import { FeedbackQueue } from "./FeedbackQueue";
import { RunPipelineButton } from "./RunPipelineButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SEO Growth Workbench",
  robots: { index: false, follow: false },
};

const actionLabels: Record<RecommendedAction, string> = {
  create_page: "新建页面",
  improve_page: "优化页面",
  consolidate: "合并意图",
  observe: "继续观察",
};

const trendDirectionLabels: Record<GoogleTrendsDirection, string> = {
  rising: "上升",
  flat: "持平",
  falling: "下降",
  unknown: "方向未知",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCollectedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function historyPoints(reports: DailySeoReport[]) {
  return reports.map((item) => ({
    date: item.date.slice(5),
    score: Math.max(...item.opportunities.map((opportunity) => opportunity.score), 0),
    demand: Math.max(...item.opportunities.map((opportunity) => opportunity.demandScore ?? 0), 0),
    candidates: item.summary.candidatesAnalyzed,
  }));
}

function metricValue(metric: ObservedMetric) {
  if (metric.status !== "observed" || metric.value === null) return "—";
  return metric.value.toLocaleString("zh-CN");
}

function currencyValue(metric: ObservedMetric, currency?: string) {
  if (metric.status !== "observed" || metric.value === null || !currency) return "—";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(metric.value / 100);
}

function funnelRate(numerator: ObservedMetric, denominator: ObservedMetric) {
  if (numerator.status !== "observed" || denominator.status !== "observed" || numerator.value === null || !denominator.value) return "—";
  return `${((numerator.value / denominator.value) * 100).toFixed(1)}%`;
}

type RankingAvailability = "observed" | "partial" | "unavailable";

type PageRankingRow = {
  entry: GrowthPortfolioEntry;
  availability: RankingAvailability;
  impressions: number | null;
  clicks: number | null;
  landingUv: number | null;
  qualifiedOutbound: number | null;
  detail: string;
};

function observedNumber(metric: ObservedMetric) {
  return metric.status === "observed" ? metric.value : null;
}

function createPageRankingRow(entry: GrowthPortfolioEntry): PageRankingRow {
  if (entry.state === "unavailable") {
    return {
      entry,
      availability: "unavailable",
      impressions: null,
      clicks: null,
      landingUv: null,
      qualifiedOutbound: null,
      detail: entry.reason,
    };
  }

  const searchPerformance = entry.report.searchPerformance;
  const impressions = searchPerformance?.state === "observed" ? searchPerformance.impressions : null;
  const clicks = searchPerformance?.state === "observed" ? searchPerformance.clicks : null;
  const landingUv = observedNumber(entry.report.metrics.landingUv);
  const qualifiedOutbound = observedNumber(entry.report.metrics.qualifiedOutboundClicks);
  const values = [impressions, clicks, landingUv, qualifiedOutbound];
  const availability = values.every((value) => value !== null) ? "observed" : "partial";
  const missingDetails = [
    impressions === null || clicks === null
      ? searchPerformance?.detail ?? "exact-page Search Console 数据不可用"
      : null,
    landingUv === null ? entry.report.metrics.landingUv.detail : null,
    qualifiedOutbound === null ? entry.report.metrics.qualifiedOutboundClicks.detail : null,
  ].filter((detail): detail is string => Boolean(detail));

  return {
    entry,
    availability,
    impressions,
    clicks,
    landingUv,
    qualifiedOutbound,
    detail: missingDetails.length ? missingDetails.join("；") : "四项公开决策指标均为已观测数据。",
  };
}

function compareNullableDescending(left: number | null, right: number | null) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return right - left;
}

function comparePageRanking(left: PageRankingRow, right: PageRankingRow) {
  const availabilityOrder: Record<RankingAvailability, number> = {
    observed: 0,
    partial: 1,
    unavailable: 2,
  };
  const availabilityDifference =
    availabilityOrder[left.availability] - availabilityOrder[right.availability];
  if (availabilityDifference) return availabilityDifference;

  for (const [leftValue, rightValue] of [
    [left.impressions, right.impressions],
    [left.clicks, right.clicks],
    [left.landingUv, right.landingUv],
    [left.qualifiedOutbound, right.qualifiedOutbound],
  ] as const) {
    const difference = compareNullableDescending(leftValue, rightValue);
    if (difference) return difference;
  }

  return left.entry.sourceSlug.localeCompare(right.entry.sourceSlug);
}

function rankingValue(value: number | null) {
  return value === null ? "—" : value.toLocaleString("zh-CN");
}

export default async function WorkbenchPage() {
  const requestHeaders = await headers();
  if (process.env.WORKBENCH_PASSWORD && !isBasicAuthHeaderAuthorized(requestHeaders.get("authorization"))) {
    notFound();
  }

  let report = createDisconnectedReport();
  let history: DailySeoReport[] = [];
  const pipeline = await readDailyPipelineStatus();
  try {
    history = await readReportHistory(14);
    report = history.at(-1) ?? report;
  } catch (error) {
    report.caveats.push(error instanceof Error ? error.message : "读取日报历史失败。");
  }

  if (process.env.NODE_ENV === "production" && !process.env.WORKBENCH_PASSWORD) {
    report = redactPrivateReportData(report);
  }

  const top = report.opportunities[0];
  const evidence = report.evidence ?? [];
  const points = historyPoints(history);
  const trendSignals = report.trendSignals ?? [];
  const publications = report.publications?.length ? report.publications : report.publication ? [report.publication] : [];
  const drafts = report.drafts?.length ? report.drafts : report.draft ? [report.draft] : [];
  const canRefresh = true;
  const feedbackEnabled = Boolean(process.env.WORKBENCH_PASSWORD && process.env.GITHUB_REPORTS_TOKEN);
  const hotSignals = report.opportunities.slice(0, 5).map((opportunity) => {
    const evidenceRefs = new Set(opportunity.decisionEvidence?.evidenceRefs ?? []);
    const supportingEvidence = evidence.filter((item) =>
      (item.id ? evidenceRefs.has(item.id) : false) ||
      item.supports.some((keyword) => keyword.toLowerCase() === opportunity.keyword.toLowerCase())
    );
    const evidenceCollectedAt = supportingEvidence
      .map((item) => item.collectedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

    return {
      ...opportunity,
      evidenceCount: supportingEvidence.length,
      evidenceCollectedAt,
    };
  });
  const funnel = report.funnel ?? createUnavailableFunnel(report.date);
  const portfolio = report.portfolioFunnels;
  const portfolioDecision = report.portfolioDecision;
  const rankedPortfolioRows = portfolio
    ? portfolio.entries.map(createPageRankingRow).sort(comparePageRanking)
    : [];
  const aggregationKey = funnel.aggregationKey ?? "source_slug+reporting_period";
  const conversionJoinKey = funnel.conversionJoinKey ?? funnel.joinKey ?? "seo_click_id";
  const hasSearchPerformance = report.performance.length > 0;
  const pagesWithSearchImpressions = new Set(
    report.performance
      .filter((row) => row.impressions > 0)
      .map((row) => {
        try {
          return row.url.startsWith("/") ? row.url : new URL(row.url).pathname;
        } catch {
          return row.url;
        }
      }),
  ).size;
  const funnelRows = [
    ["Google organic clicks", funnel.metrics.organicClicks, "Search Console", "count"],
    ["SEO landing UV", funnel.metrics.landingUv, "Vercel Analytics", "count"],
    ["Qualified outbound", funnel.metrics.qualifiedOutboundClicks, "SEO redirect", "count"],
    ["Trial starts", funnel.metrics.trialStarts, "NovelAI callback", "count"],
    ["Signups", funnel.metrics.signups, "NovelAI callback", "count"],
    ["Paid conversions", funnel.metrics.paidConversions, "Payment callback", "count"],
    ["Attributed revenue", funnel.metrics.revenueMinor, funnel.currency ?? "Currency unavailable", "currency"],
  ] as const;
  const decisionOutcome = !portfolioDecision
    ? "阻断：缺少组合决策"
    : portfolioDecision.action === "observe"
      ? "继续观察：当前不发布"
      : portfolioDecision.action === "improve_page"
        ? "优化现有页：不是新建页面"
        : portfolioDecision.action === "consolidate"
          ? "合并意图：不是新建页面"
          : "进入新建候选：仍需硬门槛与独立审稿";
  const decisionRationale = portfolioDecision?.rationale ??
    "日报没有 portfolioDecision，不能用机会分代替发布授权。";

  return (
    <main className="wb-shell">
      <aside className="wb-sidebar">
        <a className="wb-brand" href="/workbench" aria-label="SEO Growth Workbench 首页">
          <span className="wb-brand-mark">N</span>
          <span><strong>Growth OS</strong><small>NovelAI SEO</small></span>
        </a>
        <nav className="wb-nav" aria-label="工作台导航">
          <a className="active" href="#overview"><span>◈</span>今日总览</a>
          <a href="#pipeline"><span>✓</span>今日流水线</a>
          <a href="#signals"><span>↗</span>趋势与热点</a>
          <a href="#opportunities"><span>◎</span>机会雷达</a>
          <a href="#ranking"><span>≋</span>SEO 页面榜单</a>
          <a href="#distribution"><span>⌁</span>收录与外链</a>
          <a href="#funnel"><span>◇</span>营收漏斗</a>
          <a href="#portfolio"><span>▦</span>全站增长</a>
          <a href="#cluster"><span>⌘</span>内容集群</a>
          <a href="#feedback"><span>✦</span>内容指导</a>
          <a href="/workbench/reports"><span>▤</span>日报归档</a>
          <a href="#performance"><span>◌</span>搜索表现</a>
          <a href="/workbench/guide"><span>?</span>使用指南</a>
        </nav>
        <div className="wb-sidebar-note">
          <span className={`wb-dot ${report.mode}`} />
          <p><strong>{report.mode === "partial" ? "部分真实数据" : report.mode === "live" ? "真实数据" : "等待数据"}</strong><small>09:15 每日单页 · 独立审稿</small></p>
        </div>
      </aside>

      <div className="wb-main">
        <header className="wb-topbar">
          <div><p className="wb-kicker">DAILY COMMAND CENTER</p><h1>把研究、内容和反馈放进同一份可追溯日报。</h1></div>
          <div className="wb-top-actions"><a className="wb-guide-link" href="/workbench/reports">查看日报</a><a className="wb-guide-link" href="/workbench/guide">打开使用指南</a><RunPipelineButton enabled={canRefresh} /></div>
        </header>

        <section className={`wb-hero ${top ? "" : "wb-hero-empty"}`} id="overview">
          <div className="wb-hero-copy">
            <div className="wb-meta-row"><span className={`wb-mode-badge ${report.mode}`}>{report.mode.toUpperCase()}</span><span>{report.date}</span><span>更新于 {formatTime(report.generatedAt)}</span></div>
            <div className={`wb-decision-strip ${portfolioDecision?.action ?? "missing"}`}>
              <div>
                <span>PORTFOLIO DECISION · 发布以此为准</span>
                <strong>{decisionOutcome}</strong>
                <code>{portfolioDecision?.action ?? "missing"}</code>
              </div>
              <p><b>{portfolioDecision?.action === "create_page" ? "决策依据" : "阻断理由"}：</b>{decisionRationale}</p>
            </div>
            <p className="wb-label">今日最高优先级</p>
            <h2>{top?.keyword ?? "等待下一次已验证研究"}</h2>
            <p>{top ? top.reason : "这里不会回退为演示数据。只有可追溯的免费研究、公开证据和已读取的 Search Console 数据才会出现。"}</p>
            <div className="wb-hero-actions">
              {publications.filter((item) => item.status === "published" && item.path).map((item) => <a className="wb-primary-link" href={item.path} key={item.path}>打开已发布页面</a>)}
              <a className="wb-secondary-link" href="#opportunities">比较候选词</a>
            </div>
          </div>
          <div className="wb-score-card">
            <span>OPPORTUNITY SCORE</span><strong>{top?.score ?? "—"}</strong><div className="wb-score-track"><i style={{ width: `${top?.score ?? 0}%` }} /></div>
            <dl><div><dt>需求代理分</dt><dd>{top ? `${top.demandScore ?? 0}/100` : "—"}</dd></div><div><dt>竞争代理分</dt><dd>{top?.difficulty ?? "—"}</dd></div><div><dt>产品匹配</dt><dd>{top?.productFit ?? "—"}</dd></div><div><dt>评分依据</dt><dd>{top?.scoreBasis === "evidence_signals_v1" ? "证据信号" : "历史规则"}</dd></div></dl>
          </div>
        </section>

        <section className="wb-section" id="pipeline">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">TODAY&apos;S PIPELINE · {pipeline.date}</p><h2>把“有文件”与“真的可发布”分开。</h2></div>
            <span className={`wb-mode-badge ${pipeline.stage === "published" ? "live" : pipeline.blockers.length ? "blocked" : "partial"}`}>{pipeline.stage.toUpperCase()}</span>
          </div>
          <div className="wb-pipeline-grid">
            {([
              ["增长快照", "growth"],
              ["研究输入", "research"],
              ["构建日报", "report"],
              ["独立审稿", "review"],
              ["日报 PDF", "pdf"],
            ] as const).map(([label, key]) => (
              <article key={key} className={pipeline.artifacts[key] ? "ready" : "missing"}>
                <span>{pipeline.artifacts[key] === null ? "LOCAL ONLY" : pipeline.artifacts[key] ? "EXISTS" : "MISSING"}</span>
                <strong>{label}</strong>
                <small>{key === "research" && pipeline.artifacts.research
                  ? `policy v${pipeline.research.policyVersion ?? "?"} · ${pipeline.research.candidateCount ?? 0} candidates`
                  : key === "pdf" && pipeline.artifacts.pdf === null
                    ? "生产环境不推断工作站 PDF"
                    : key}</small>
              </article>
            ))}
          </div>
          {report.date !== pipeline.date ? <p className="wb-pipeline-warning">当前可读日报为 {report.date}，不是今天；页面上方机会与漏斗属于历史日报。</p> : null}
          {pipeline.blockers.length ? (
            <div className="wb-pipeline-blockers">
              <strong>今日阻断</strong>
              <ul>{pipeline.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            </div>
          ) : <div className="wb-empty-state">当前文件级检查没有阻塞；发布仍需 builder、审稿、完整验证、远端推送和线上检查分别通过。</div>}
        </section>

        <section className="wb-stat-grid" aria-label="关键指标">
          <article><p>研究候选</p><strong>{report.summary.candidatesAnalyzed}</strong><span>公开研究已覆盖的英文意图</span></article>
          <article><p>可执行机会</p><strong>{report.summary.publishableOpportunities}</strong><span>新建分数至少 {seoPolicy.createPageThreshold}，且还需通过全部硬门槛</span></article>
          <article><p>Search Console 曝光</p><strong>{hasSearchPerformance ? report.summary.totalImpressions.toLocaleString() : "—"}</strong><span>{hasSearchPerformance ? "仅可见/导出的真实数据" : "当前无可见数据，不按 0 处理"}</span></article>
          <article><p>Search Console CTR</p><strong>{hasSearchPerformance ? `${(report.summary.averageCtr * 100).toFixed(1)}%` : "—"}</strong><span>{hasSearchPerformance ? `${report.summary.totalClicks} 次真实点击` : "等待 Search Console 返回行"}</span></article>
        </section>

        <section className="wb-section" id="distribution">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">DISCOVERY &amp; DISTRIBUTION</p><h2>发布、部署、收录和外链是四个独立状态。</h2></div>
            <span className="wb-data-note">没有可见证据时保持 unavailable；提交 sitemap 或 outreach 清单都不算完成。</span>
          </div>
          <div className="wb-stat-grid">
            <article><p>内容发布记录</p><strong>{publications.some((item) => item.status === "published") ? "PUBLISHED" : "—"}</strong><span>{publications.some((item) => item.status === "published") ? "最新日报含 published 记录" : "最新日报没有 published 记录"}</span></article>
            <article><p>生产部署</p><strong>—</strong><span>日报未保存 Vercel READY 证据，不从本地构建推断</span></article>
            <article><p>Google 搜索曝光证据</p><strong>{pagesWithSearchImpressions || "—"}</strong><span>{pagesWithSearchImpressions ? `${pagesWithSearchImpressions} 页有非零 exact-page GSC 曝光` : "没有可见页面行，不能声称已收录"}</span></article>
            <article><p>第三方外链</p><strong>—</strong><span>没有获授权且可访问的第三方链接记录</span></article>
          </div>
          <div className="wb-empty-state">
            发布后先验证线上 200、唯一 H1、canonical、归因 CTA、robots 与 sitemap；URL Inspection 只记录“已请求”或 Google 返回的实际状态。外链只能投放到你授权的站点或账号，第三方公开页面真实指向目标 URL 后才记为 backlink-live。
          </div>
        </section>

        <section className="wb-section" id="funnel">
          <div className="wb-section-heading"><div><p className="wb-kicker">SEARCH → REVENUE</p><h2>搜索与 UV 按页面周期聚合，转化用 click_id 连接。</h2></div><span className="wb-data-note">归因状态：{funnel.attributionStatus} · 聚合键：{aggregationKey} · 转化键：{conversionJoinKey}</span></div>
          <p className="wb-data-note">
            {portfolio
              ? `页面组合快照：${portfolio.summary.collectedPages}/${portfolio.summary.publishedPages} 个已发布页面已采集；${portfolio.summary.unavailablePages} 个不可用。周期 ${portfolio.periodStart.slice(0, 10)} 至 ${portfolio.periodEnd.slice(0, 10)}。`
              : "当前日报是旧版产物，没有全页面增长快照；新版工作流会将其视为不可用于扩页决策。"}
          </p>
          <div className="wb-table-wrap"><table><thead><tr><th>漏斗步骤</th><th>观测值</th><th>来源</th><th>状态说明</th></tr></thead><tbody>{funnelRows.map(([label, metric, source, format]) => <tr key={label}><td><strong>{label}</strong></td><td><strong className="wb-score-inline">{format === "currency" ? currencyValue(metric, funnel.currency) : metricValue(metric)}</strong></td><td>{source}</td><td>{metric.detail}</td></tr>)}</tbody></table></div>
          <div className="wb-stat-grid wb-funnel-rates">
            <article><p>落地页 → NovelAI</p><strong>{funnelRate(funnel.metrics.qualifiedOutboundClicks, funnel.metrics.landingUv)}</strong><span>高质量出站率</span></article>
            <article><p>NovelAI → 试玩</p><strong>{funnelRate(funnel.metrics.trialStarts, funnel.metrics.qualifiedOutboundClicks)}</strong><span>试玩转化率</span></article>
            <article><p>试玩 → 付费</p><strong>{funnelRate(funnel.metrics.paidConversions, funnel.metrics.trialStarts)}</strong><span>付费转化率</span></article>
            <article><p>每个 SEO UV 营收</p><strong>{funnel.metrics.revenueMinor.status === "observed" && funnel.metrics.landingUv.status === "observed" && funnel.metrics.revenueMinor.value !== null && funnel.metrics.landingUv.value ? currencyValue({ ...funnel.metrics.revenueMinor, value: funnel.metrics.revenueMinor.value / funnel.metrics.landingUv.value }, funnel.currency) : "—"}</strong><span>收入 / 落地页 UV</span></article>
          </div>
        </section>

        <section className="wb-section" id="portfolio">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">ALL-PAGE GROWTH PORTFOLIO</p><h2>每天先看全部已发布页面，再决定新建、优化还是暂停。</h2></div>
            <span className="wb-data-note">{portfolio ? `${portfolio.periodStart.slice(0, 10)} → ${portfolio.periodEnd.slice(0, 10)} · ${portfolio.summary.collectedPages}/${portfolio.summary.publishedPages} 页已采集 · 决策 ${portfolioDecision?.action ?? "未记录"}` : "等待第一份全站增长快照"}</span>
          </div>
          {portfolio ? (
            <>
              <div className="wb-stat-grid">
                <article><p>已发布页面</p><strong>{portfolio.summary.publishedPages}</strong><span>快照必须覆盖全部页面</span></article>
                <article><p>已采集页面</p><strong>{portfolio.summary.collectedPages}</strong><span>返回真实页面级漏斗</span></article>
                <article><p>不可用页面</p><strong>{portfolio.summary.unavailablePages}</strong><span>缺失数据保留原因，不换算为 0</span></article>
                <article><p>发布反馈门</p><strong>{portfolio.summary.attributionJoinBlocked ? "阻断" : portfolio.summary.attributionJoinReady ? "正常" : "待验证"}</strong><span>公开日报只保留归因连接的布尔状态</span></article>
              </div>
              {portfolioDecision ? <div className="wb-empty-state"><strong>{portfolioDecision.action}</strong>：{portfolioDecision.rationale}</div> : null}
            </>
          ) : <div className="wb-empty-state">运行 growth:collect 后，工作台会逐页显示 exact-page GSC、URL Inspection、UV、合格出站与布尔门槛；没有凭证时只显示不可用原因。</div>}
        </section>

        <section className="wb-section" id="ranking">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">SEO PAGE LEADERBOARD</p><h2>SEO 页面榜单</h2></div>
            <span className="wb-data-note">先按观测可用状态，再按 exact-page GSC 曝光、点击、UV、合格出站降序；“—”代表不可用，不代表 0。</span>
          </div>
          {rankedPortfolioRows.length ? (
            <div className="wb-table-wrap wb-ranking-table">
              <table>
                <thead><tr><th>页面</th><th>数据状态</th><th>GSC 曝光</th><th>GSC 点击</th><th>落地 UV</th><th>合格出站</th><th>状态说明</th></tr></thead>
                <tbody>{rankedPortfolioRows.map((row, index) => (
                  <tr key={row.entry.sourceSlug}>
                    <td><span className="wb-rank">{String(index + 1).padStart(2, "0")}</span><strong><a href={row.entry.path}>{row.entry.keyword}</a></strong><small>{row.entry.path}</small></td>
                    <td><span className={`wb-mode-badge ${row.availability === "observed" ? "live" : row.availability === "partial" ? "partial" : "blocked"}`}>{row.availability.toUpperCase()}</span></td>
                    <td title={row.impressions === null ? row.detail : undefined}>{rankingValue(row.impressions)}</td>
                    <td title={row.clicks === null ? row.detail : undefined}>{rankingValue(row.clicks)}</td>
                    <td title={row.landingUv === null ? row.detail : undefined}>{rankingValue(row.landingUv)}</td>
                    <td title={row.qualifiedOutbound === null ? row.detail : undefined}>{rankingValue(row.qualifiedOutbound)}</td>
                    <td className="wb-ranking-detail">{row.detail}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="wb-empty-state">尚无全站页面快照；榜单不会用推测值或演示数据占位。</div>}
        </section>

        <section className="wb-section" id="signals">
          <div className="wb-section-heading"><div><p className="wb-kicker">TREND & HOT SIGNALS</p><h2>趋势是日报快照，热点必须能回到证据。</h2></div><span className="wb-data-note">不把代理分包装成搜索量；不足两天历史时明确显示不可判断。</span></div>
          <div className="wb-signal-grid">
            <article className="wb-trend-card"><h3>研究快照趋势</h3>{points.length < 2 ? <p>目前仅有 {points.length} 个日报快照；积累至少两天后才显示方向，不推测趋势。</p> : <div className="wb-trend-bars">{points.map((point) => <div key={point.date}><i style={{ height: `${Math.max(point.score, 6)}%` }} title={`${point.score}/100`} /><strong>{point.score}</strong><small>{point.date}</small></div>)}</div>}<small>柱高：当日最高机会分；非搜索量。</small></article>
            <article className="wb-hot-card"><h3>当前研究热点</h3><ul>{hotSignals.map((signal) => <li key={signal.keyword}><div><strong>{signal.keyword}</strong><span>{signal.evidenceCount} 条直接证据 · 采集 {signal.evidenceCollectedAt ? formatCollectedAt(signal.evidenceCollectedAt) : "时间不可用"}</span></div><b>{signal.score}</b></li>)}</ul></article>
            <article className="wb-hot-card wb-google-trends">
              <h3>Google Trends 官方信号</h3>
              {trendSignals.length ? (
                <ul>{trendSignals.slice(0, 8).map((signal) => (
                  <li key={`${signal.keyword}-${signal.geo}-${signal.period}`}>
                    <div>
                      <strong><a href={signal.sourceUrl} target="_blank" rel="noreferrer">{signal.keyword}</a></strong>
                      <span>{signal.geo} · {signal.period} · {signal.state === "observed" ? trendDirectionLabels[signal.direction] : "明确不可用"} · 采集 {formatCollectedAt(signal.collectedAt)}</span>
                      <span>{signal.detail}</span>
                    </div>
                    <b>{signal.state === "observed" ? signal.relativeInterest : "不可用"}</b>
                  </li>
                ))}</ul>
              ) : <p>本日报没有 Google Trends 官方观测；工作台不会用机会分、第三方估算或演示值补位。</p>}
              <small>相对热度为所选地区与周期内归一化的 0–100 指数，不是关键词搜索量；点击关键词可回到官方来源。</small>
            </article>
          </div>
        </section>

        <section className="wb-section" id="opportunities">
          <div className="wb-section-heading"><div><p className="wb-kicker">OPPORTUNITY RADAR</p><h2>只显示有公开来源支撑的机会。</h2></div><span className="wb-data-note">需求与难度都是 0–100 透明代理分；新建分数门槛为 {seoPolicy.createPageThreshold}，还需通过全部硬门槛。</span></div>
          {report.opportunities.length ? <div className="wb-table-wrap"><table><thead><tr><th>关键词</th><th>意图阶段</th><th>需求</th><th>竞争</th><th>试玩</th><th>付费</th><th>机会分</th><th>动作</th></tr></thead><tbody>{report.opportunities.slice(0, 8).map((opportunity, index) => <tr key={opportunity.keyword}><td><span className="wb-rank">{String(index + 1).padStart(2, "0")}</span><strong>{opportunity.keyword}</strong><small>{opportunity.scoreBasis === "evidence_signals_v1" ? `规则计算 · ${opportunity.decisionEvidence?.evidenceRefs.length ?? 0} 条引用` : opportunity.source}</small></td><td>{opportunity.funnelStage ?? opportunity.intent}</td><td>{opportunity.demandScore ?? 0}/100</td><td><span className={`wb-kd ${opportunity.difficulty <= 30 ? "easy" : opportunity.difficulty <= 50 ? "medium" : "hard"}`}>{opportunity.difficulty}</span></td><td>{opportunity.trialIntent ?? "—"}</td><td>{opportunity.revenueIntent ?? "—"}</td><td><strong className="wb-score-inline">{opportunity.score}</strong></td><td><span className={`wb-action-tag ${opportunity.action}`}>{actionLabels[opportunity.action]}</span></td></tr>)}</tbody></table></div> : <div className="wb-empty-state">等待本地免费研究自动化；不会用演示关键词填充。</div>}
        </section>

        <section className="wb-section" id="cluster">
          <div className="wb-section-heading"><div><p className="wb-kicker">INTENT ARCHITECTURE</p><h2>一个日报，一篇页面，一条可归因链路。</h2></div><span className="wb-data-note">每日新增上限 1；改旧页与新建页分开决策。</span></div>
          <div className="wb-cluster-flow"><div><b>独立搜索意图</b><span>{top?.keyword ?? "待研究"}</span></div><i>→</i><div><b>SEO 落地页</b><span>{publications[0]?.path ?? "待审稿"}</span></div><i>→</i><div><b>试玩与付费</b><span>seo_click_id</span></div></div>
          <p className="wb-cluster-note">新增页必须回答新的搜索者任务，并至少链接一个真正相关的已发布页面。裸首页只负责跳转，不再冒充主题枢纽。</p>
          <div className="wb-publication-list">{publications.length ? publications.map((item, index) => <article key={`${item.slug ?? item.slot}-${index}`}><strong>每日页面</strong><span>{item.status === "published" ? "已发布" : item.status === "ready_for_review" ? "待独立审稿" : "未发布"}</span><p>{item.path ?? item.reason}</p></article>) : <div className="wb-empty-state">本日报尚未记录可发布页面。</div>}</div>
        </section>

        {evidence.length ? <section className="wb-section" id="evidence"><div className="wb-section-heading"><div><p className="wb-kicker">RESEARCH EVIDENCE</p><h2>每个信号都能回到公开来源。</h2></div><span className="wb-data-note">链接只作为研究证据，不代表合作或背书。</span></div><div className="wb-evidence-grid">{evidence.slice(0, 8).map((item) => <a href={item.url} key={`${item.url}-${item.title}`} target="_blank" rel="noreferrer"><span>{item.source}</span><strong>{item.title}</strong><small>采集：{formatCollectedAt(item.collectedAt)} · 支持：{item.supports.join("、")}</small></a>)}</div></section> : null}

        <div className="wb-two-column">
          <section className="wb-section wb-action-list"><div className="wb-section-heading compact"><div><p className="wb-kicker">ACTION QUEUE</p><h2>今天的行动</h2></div></div>{report.actions.map((action) => <article key={action.priority}><span>{action.priority}</span><div><h3>{action.action}</h3><p>{action.why}</p><small>{action.expectedImpact}</small></div></article>)}</section>
          <section className="wb-section" id="feedback">
            <div className="wb-section-heading compact"><div><p className="wb-kicker">CONTENT GUIDANCE → NEXT RUN</p><h2>把你的方向直接带进下一次生产。</h2></div></div>
            <FeedbackForm enabled={feedbackEnabled} />
            <FeedbackQueue enabled={feedbackEnabled} />
            {report.feedbackDecisions?.length ? (
              <div className="wb-feedback-decisions">
                <strong>本期已记录决定</strong>
                {report.feedbackDecisions.map((item) => (
                  <article key={`${item.date}-${item.id}`}>
                    <span>{item.decision === "adopted" ? "ADOPTED" : "REJECTED"} · {item.date}</span>
                    <p>{item.message}</p>
                    <small>{item.rationale}</small>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <section className="wb-section wb-generated" id="generated"><div className="wb-section-heading"><div><p className="wb-kicker">FACT-CONSTRAINED CONTENT</p><h2>当日草稿与两段式发布闸门</h2></div><span className="wb-data-note">每天最多一篇；自动检查通过后仍需独立批准记录。</span></div>{drafts.length ? <div className="wb-draft-list">{drafts.map((item) => {
          const draftSlug = item.slug || `/${item.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
          const draftPublication = publications.find((publication) => publication.slug === draftSlug.replace(/^\//, ""));
          return <article className="wb-generated-grid" key={draftSlug}><div className="wb-generated-copy"><p className="wb-kicker">REVIEW-REQUIRED DRAFT</p><h3 className="wb-ai-title">{item.title}</h3><p>{item.heroMarkdown}</p><a className="wb-primary-link" href={draftPublication?.status === "published" ? draftPublication.path : `/workbench/preview/${encodeURIComponent(draftSlug.replace(/^\//, ""))}`}>打开完整内容</a></div><aside className="wb-quality-panel"><p>WORDS</p><strong>{item.quality.wordCount}</strong><p>QUALITY GATE</p>{item.quality.checks.map((check) => <span className={check.passed ? "passed" : "failed"} key={check.id}>{check.passed ? "✓" : "×"} {check.label}</span>)}</aside></article>;
        })}</div> : <div className="wb-empty-state">等待经过事实约束的英文草稿。</div>}</section>

        <section className="wb-section" id="performance"><div className="wb-section-heading"><div><p className="wb-kicker">SEARCH → ACTION</p><h2>真实表现与研究代理分开呈现。</h2></div></div>{report.performance.length ? <div className="wb-performance-grid">{report.performance.slice(0, 6).map((row) => <article key={`${row.url}-${row.query}`}><div><span>{row.query}</span><strong>{row.position.toFixed(1)}</strong><small>平均排名</small></div><dl><div><dt>曝光</dt><dd>{row.impressions}</dd></div><div><dt>点击</dt><dd>{row.clicks}</dd></div><div><dt>CTR</dt><dd>{(row.ctr * 100).toFixed(1)}%</dd></div></dl><p>{row.recommendedAction}</p></article>)}</div> : <div className="wb-empty-state">Search Console 当前不可读或没有可见行；没有推测数据。</div>}</section>

        {report.caveats.length ? <footer className="wb-caveats"><strong>数据与发布声明</strong>{report.caveats.map((caveat) => <span key={caveat}>{caveat}</span>)}</footer> : null}
      </div>
    </main>
  );
}
