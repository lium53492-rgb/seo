import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import { createDisconnectedReport, createUnavailableFunnel, redactPrivateReportData } from "@/lib/seo/default-report";
import { readLatestReport, readReportHistory } from "@/lib/seo/report-store";
import type { DailySeoReport, ObservedMetric, RecommendedAction } from "@/lib/seo/types";
import { FeedbackForm } from "./FeedbackForm";
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
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

function metricValue(metric: ObservedMetric, currency?: string) {
  if (metric.status !== "observed" || metric.value === null) return "—";
  if (metric.source === "payments" && currency) {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(metric.value / 100);
  }
  return metric.value.toLocaleString("zh-CN");
}

function funnelRate(numerator: ObservedMetric, denominator: ObservedMetric) {
  if (numerator.status !== "observed" || denominator.status !== "observed" || numerator.value === null || !denominator.value) return "—";
  return `${((numerator.value / denominator.value) * 100).toFixed(1)}%`;
}

export default async function WorkbenchPage() {
  const requestHeaders = await headers();
  if (process.env.WORKBENCH_PASSWORD && !isBasicAuthHeaderAuthorized(requestHeaders.get("authorization"))) {
    notFound();
  }

  let report = createDisconnectedReport();
  let history: DailySeoReport[] = [];
  try {
    report = (await readLatestReport()) ?? report;
    history = await readReportHistory(14);
  } catch (error) {
    report.caveats.push(error instanceof Error ? error.message : "读取日报历史失败。");
  }

  if (process.env.NODE_ENV === "production" && !process.env.WORKBENCH_PASSWORD) {
    report = redactPrivateReportData(report);
  }

  const top = report.opportunities[0];
  const evidence = report.evidence ?? [];
  const points = historyPoints(history);
  const publications = report.publications?.length ? report.publications : report.publication ? [report.publication] : [];
  const drafts = report.drafts?.length ? report.drafts : report.draft ? [report.draft] : [];
  const canRefresh = true;
  const feedbackEnabled = Boolean(process.env.WORKBENCH_PASSWORD && process.env.GITHUB_REPORTS_TOKEN);
  const hotSignals = report.opportunities.slice(0, 5).map((opportunity) => ({
    ...opportunity,
    evidenceCount: evidence.filter((item) => item.supports.map((keyword) => keyword.toLowerCase()).includes(opportunity.keyword)).length,
  }));
  const funnel = report.funnel ?? createUnavailableFunnel(report.date);
  const aggregationKey = funnel.aggregationKey ?? "source_slug+reporting_period";
  const conversionJoinKey = funnel.conversionJoinKey ?? funnel.joinKey ?? "seo_click_id";
  const hasSearchPerformance = report.performance.length > 0;
  const funnelRows = [
    ["Google organic clicks", funnel.metrics.organicClicks, "Search Console"],
    ["SEO landing UV", funnel.metrics.landingUv, "Vercel Analytics"],
    ["Qualified outbound", funnel.metrics.qualifiedOutboundClicks, "SEO redirect"],
    ["Trial starts", funnel.metrics.trialStarts, "NovelAI callback"],
    ["Signups", funnel.metrics.signups, "NovelAI callback"],
    ["Paid conversions", funnel.metrics.paidConversions, "Payment callback"],
    ["Attributed revenue", funnel.metrics.revenueMinor, funnel.currency ?? "Currency unavailable"],
  ] as const;

  return (
    <main className="wb-shell">
      <aside className="wb-sidebar">
        <a className="wb-brand" href="/workbench" aria-label="SEO Growth Workbench 首页">
          <span className="wb-brand-mark">N</span>
          <span><strong>Growth OS</strong><small>NovelAI SEO</small></span>
        </a>
        <nav className="wb-nav" aria-label="工作台导航">
          <a className="active" href="#overview"><span>◈</span>今日总览</a>
          <a href="#signals"><span>↗</span>趋势与热点</a>
          <a href="#opportunities"><span>◎</span>机会雷达</a>
          <a href="#funnel"><span>◇</span>营收漏斗</a>
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
            <dl><div><dt>需求代理分</dt><dd>{top ? `${top.demandScore ?? 0}/100` : "—"}</dd></div><div><dt>竞争代理分</dt><dd>{top?.difficulty ?? "—"}</dd></div><div><dt>产品匹配</dt><dd>{top?.productFit ?? "—"}</dd></div></dl>
          </div>
        </section>

        <section className="wb-stat-grid" aria-label="关键指标">
          <article><p>研究候选</p><strong>{report.summary.candidatesAnalyzed}</strong><span>公开研究已覆盖的英文意图</span></article>
          <article><p>可执行机会</p><strong>{report.summary.publishableOpportunities}</strong><span>机会分不低于 62</span></article>
          <article><p>Search Console 曝光</p><strong>{hasSearchPerformance ? report.summary.totalImpressions.toLocaleString() : "—"}</strong><span>{hasSearchPerformance ? "仅可见/导出的真实数据" : "当前无可见数据，不按 0 处理"}</span></article>
          <article><p>Search Console CTR</p><strong>{hasSearchPerformance ? `${(report.summary.averageCtr * 100).toFixed(1)}%` : "—"}</strong><span>{hasSearchPerformance ? `${report.summary.totalClicks} 次真实点击` : "等待 Search Console 返回行"}</span></article>
        </section>

        <section className="wb-section" id="funnel">
          <div className="wb-section-heading"><div><p className="wb-kicker">SEARCH → REVENUE</p><h2>搜索与 UV 按页面周期聚合，转化用 click_id 连接。</h2></div><span className="wb-data-note">归因状态：{funnel.attributionStatus} · 聚合键：{aggregationKey} · 转化键：{conversionJoinKey}</span></div>
          <div className="wb-table-wrap"><table><thead><tr><th>漏斗步骤</th><th>观测值</th><th>来源</th><th>状态说明</th></tr></thead><tbody>{funnelRows.map(([label, metric, source]) => <tr key={label}><td><strong>{label}</strong></td><td><strong className="wb-score-inline">{metricValue(metric, funnel.currency)}</strong></td><td>{source}</td><td>{metric.detail}</td></tr>)}</tbody></table></div>
          <div className="wb-stat-grid wb-funnel-rates">
            <article><p>落地页 → NovelAI</p><strong>{funnelRate(funnel.metrics.qualifiedOutboundClicks, funnel.metrics.landingUv)}</strong><span>高质量出站率</span></article>
            <article><p>NovelAI → 试玩</p><strong>{funnelRate(funnel.metrics.trialStarts, funnel.metrics.qualifiedOutboundClicks)}</strong><span>试玩转化率</span></article>
            <article><p>试玩 → 付费</p><strong>{funnelRate(funnel.metrics.paidConversions, funnel.metrics.trialStarts)}</strong><span>付费转化率</span></article>
            <article><p>每个 SEO UV 营收</p><strong>{funnel.metrics.revenueMinor.status === "observed" && funnel.metrics.landingUv.status === "observed" && funnel.metrics.revenueMinor.value !== null && funnel.metrics.landingUv.value ? metricValue({ ...funnel.metrics.revenueMinor, value: funnel.metrics.revenueMinor.value / funnel.metrics.landingUv.value }, funnel.currency) : "—"}</strong><span>收入 / 落地页 UV</span></article>
          </div>
        </section>

        <section className="wb-section" id="signals">
          <div className="wb-section-heading"><div><p className="wb-kicker">TREND & HOT SIGNALS</p><h2>趋势是日报快照，热点必须能回到证据。</h2></div><span className="wb-data-note">不把代理分包装成搜索量；不足两天历史时明确显示不可判断。</span></div>
          <div className="wb-signal-grid">
            <article className="wb-trend-card"><h3>研究快照趋势</h3>{points.length < 2 ? <p>目前仅有 {points.length} 个日报快照；积累至少两天后才显示方向，不推测趋势。</p> : <div className="wb-trend-bars">{points.map((point) => <div key={point.date}><i style={{ height: `${Math.max(point.score, 6)}%` }} title={`${point.score}/100`} /><strong>{point.score}</strong><small>{point.date}</small></div>)}</div>}<small>柱高：当日最高机会分；非搜索量。</small></article>
            <article className="wb-hot-card"><h3>当前研究热点</h3><ul>{hotSignals.map((signal) => <li key={signal.keyword}><div><strong>{signal.keyword}</strong><span>{signal.evidenceCount} 条直接证据 · 采集 {formatTime(report.generatedAt)}</span></div><b>{signal.score}</b></li>)}</ul></article>
          </div>
        </section>

        <section className="wb-section" id="opportunities">
          <div className="wb-section-heading"><div><p className="wb-kicker">OPPORTUNITY RADAR</p><h2>只显示有公开来源支撑的机会。</h2></div><span className="wb-data-note">需求与难度都是 0–100 透明代理分。</span></div>
          {report.opportunities.length ? <div className="wb-table-wrap"><table><thead><tr><th>关键词</th><th>意图阶段</th><th>需求</th><th>竞争</th><th>试玩</th><th>付费</th><th>机会分</th><th>动作</th></tr></thead><tbody>{report.opportunities.slice(0, 8).map((opportunity, index) => <tr key={opportunity.keyword}><td><span className="wb-rank">{String(index + 1).padStart(2, "0")}</span><strong>{opportunity.keyword}</strong><small>{opportunity.source}</small></td><td>{opportunity.funnelStage ?? opportunity.intent}</td><td>{opportunity.demandScore ?? 0}/100</td><td><span className={`wb-kd ${opportunity.difficulty <= 30 ? "easy" : opportunity.difficulty <= 50 ? "medium" : "hard"}`}>{opportunity.difficulty}</span></td><td>{opportunity.trialIntent ?? "—"}</td><td>{opportunity.revenueIntent ?? "—"}</td><td><strong className="wb-score-inline">{opportunity.score}</strong></td><td><span className={`wb-action-tag ${opportunity.action}`}>{actionLabels[opportunity.action]}</span></td></tr>)}</tbody></table></div> : <div className="wb-empty-state">等待本地免费研究自动化；不会用演示关键词填充。</div>}
        </section>

        <section className="wb-section" id="cluster">
          <div className="wb-section-heading"><div><p className="wb-kicker">INTENT ARCHITECTURE</p><h2>一个日报，一篇页面，一条可归因链路。</h2></div><span className="wb-data-note">每日新增上限 1；改旧页与新建页分开决策。</span></div>
          <div className="wb-cluster-flow"><div><b>独立搜索意图</b><span>{top?.keyword ?? "待研究"}</span></div><i>→</i><div><b>SEO 落地页</b><span>{publications[0]?.path ?? "待审稿"}</span></div><i>→</i><div><b>试玩与付费</b><span>seo_click_id</span></div></div>
          <p className="wb-cluster-note">新增页必须回答新的搜索者任务，并至少链接一个真正相关的已发布页面。裸首页只负责跳转，不再冒充主题枢纽。</p>
          <div className="wb-publication-list">{publications.length ? publications.map((item, index) => <article key={`${item.slug ?? item.slot}-${index}`}><strong>每日页面</strong><span>{item.status === "published" ? "已发布" : item.status === "ready_for_review" ? "待独立审稿" : "未发布"}</span><p>{item.path ?? item.reason}</p></article>) : <div className="wb-empty-state">本日报尚未记录可发布页面。</div>}</div>
        </section>

        {evidence.length ? <section className="wb-section" id="evidence"><div className="wb-section-heading"><div><p className="wb-kicker">RESEARCH EVIDENCE</p><h2>每个信号都能回到公开来源。</h2></div><span className="wb-data-note">链接只作为研究证据，不代表合作或背书。</span></div><div className="wb-evidence-grid">{evidence.slice(0, 8).map((item) => <a href={item.url} key={`${item.url}-${item.title}`} target="_blank" rel="noreferrer"><span>{item.source}</span><strong>{item.title}</strong><small>支持：{item.supports.join("、")}</small></a>)}</div></section> : null}

        <div className="wb-two-column">
          <section className="wb-section wb-action-list"><div className="wb-section-heading compact"><div><p className="wb-kicker">ACTION QUEUE</p><h2>今天的行动</h2></div></div>{report.actions.map((action) => <article key={action.priority}><span>{action.priority}</span><div><h3>{action.action}</h3><p>{action.why}</p><small>{action.expectedImpact}</small></div></article>)}</section>
          <section className="wb-section" id="feedback"><div className="wb-section-heading compact"><div><p className="wb-kicker">CONTENT GUIDANCE → NEXT RUN</p><h2>把你的方向直接带进下一次生产。</h2></div></div><FeedbackForm enabled={feedbackEnabled} /></section>
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
