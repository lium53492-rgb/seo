import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import { createDisconnectedReport } from "@/lib/seo/pipeline";
import { readLatestReport, readReportHistory } from "@/lib/seo/report-store";
import type { DailySeoReport, RecommendedAction } from "@/lib/seo/types";
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

  const top = report.opportunities[0];
  const evidence = report.evidence ?? [];
  const points = historyPoints(history);
  const publications = report.publications?.length ? report.publications : report.publication ? [report.publication] : [];
  const drafts = report.drafts?.length ? report.drafts : report.draft ? [report.draft] : [];
  const canRefresh = process.env.NODE_ENV !== "production" || Boolean(process.env.WORKBENCH_PASSWORD);
  const hotSignals = report.opportunities.slice(0, 5).map((opportunity) => ({
    ...opportunity,
    evidenceCount: evidence.filter((item) => item.supports.map((keyword) => keyword.toLowerCase()).includes(opportunity.keyword)).length,
  }));

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
          <a href="#cluster"><span>⌘</span>内容集群</a>
          <a href="#feedback"><span>✦</span>反馈队列</a>
          <a href="#performance"><span>◌</span>搜索表现</a>
          <a href="/workbench/guide"><span>?</span>使用指南</a>
        </nav>
        <div className="wb-sidebar-note">
          <span className={`wb-dot ${report.mode}`} />
          <p><strong>{report.mode === "partial" ? "部分真实数据" : report.mode === "live" ? "真实数据" : "等待数据"}</strong><small>09:15 主生产 · 16:15 临时集群篇</small></p>
        </div>
      </aside>

      <div className="wb-main">
        <header className="wb-topbar">
          <div><p className="wb-kicker">DAILY COMMAND CENTER</p><h1>把研究、内容和反馈放进同一份可追溯日报。</h1></div>
          <div className="wb-top-actions"><a className="wb-guide-link" href="/workbench/guide">打开使用指南</a><RunPipelineButton enabled={canRefresh} /></div>
        </header>

        <section className={`wb-hero ${top ? "" : "wb-hero-empty"}`} id="overview">
          <div className="wb-hero-copy">
            <div className="wb-meta-row"><span className={`wb-mode-badge ${report.mode}`}>{report.mode.toUpperCase()}</span><span>{report.date}</span><span>更新于 {formatTime(report.generatedAt)}</span></div>
            <p className="wb-label">今日最高优先级</p>
            <h2>{top?.keyword ?? "等待下一次已验证研究"}</h2>
            <p>{top ? top.reason : "这里不会回退为演示数据。只有可追溯的免费研究、公开证据和已读取的 Search Console 数据才会出现。"}</p>
            <div className="wb-hero-actions">
              {publications.filter((item) => item.status === "published" && item.path).map((item) => <a className="wb-primary-link" href={item.path} key={item.path}>打开{item.slot === "afternoon" ? "下午" : "上午"}页面</a>)}
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
          <article><p>Search Console 曝光</p><strong>{report.summary.totalImpressions.toLocaleString()}</strong><span>仅可见/导出的真实数据</span></article>
          <article><p>Search Console CTR</p><strong>{(report.summary.averageCtr * 100).toFixed(1)}%</strong><span>{report.summary.totalClicks} 次真实点击</span></article>
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
          {report.opportunities.length ? <div className="wb-table-wrap"><table><thead><tr><th>关键词</th><th>意图</th><th>需求</th><th>竞争</th><th>产品匹配</th><th>机会分</th><th>动作</th></tr></thead><tbody>{report.opportunities.slice(0, 8).map((opportunity, index) => <tr key={opportunity.keyword}><td><span className="wb-rank">{String(index + 1).padStart(2, "0")}</span><strong>{opportunity.keyword}</strong><small>{opportunity.source}</small></td><td>{opportunity.intent}</td><td>{opportunity.demandScore ?? 0}/100</td><td><span className={`wb-kd ${opportunity.difficulty <= 30 ? "easy" : opportunity.difficulty <= 50 ? "medium" : "hard"}`}>{opportunity.difficulty}</span></td><td>{opportunity.productFit}</td><td><strong className="wb-score-inline">{opportunity.score}</strong></td><td><span className={`wb-action-tag ${opportunity.action}`}>{actionLabels[opportunity.action]}</span></td></tr>)}</tbody></table></div> : <div className="wb-empty-state">等待本地免费研究自动化；不会用演示关键词填充。</div>}
        </section>

        <section className="wb-section" id="cluster">
          <div className="wb-section-heading"><div><p className="wb-kicker">TOPIC CLUSTER</p><h2>一个日报，两篇页面，一张内部链接网络。</h2></div><span className="wb-data-note">下午篇是次日早篇的前移，不另建日报。</span></div>
          <div className="wb-cluster-flow"><div><b>首页主题枢纽</b><span>/</span></div><i>→</i><div><b>上午页</b><span>{publications.find((item) => item.slot !== "afternoon")?.path ?? "待质量闸门"}</span></div><i>→</i><div><b>下午页</b><span>{publications.find((item) => item.slot === "afternoon")?.path ?? "16:15 前移发布"}</span></div></div>
          <p className="wb-cluster-note">每篇新增页都必须是不同意图；下午页在存在相关页面时至少链接一个已发布的一方路由。首页自动列出已发布指南，形成主题层级的第一层。</p>
          <div className="wb-publication-list">{publications.length ? publications.map((item, index) => <article key={`${item.slug ?? item.slot}-${index}`}><strong>{item.slot === "afternoon" ? "下午篇" : "上午篇"}</strong><span>{item.status === "published" ? "已通过闸门" : "未发布"}</span><p>{item.path ?? item.reason}</p></article>) : <div className="wb-empty-state">本日报尚未记录可发布页面。</div>}</div>
        </section>

        {evidence.length ? <section className="wb-section" id="evidence"><div className="wb-section-heading"><div><p className="wb-kicker">RESEARCH EVIDENCE</p><h2>每个信号都能回到公开来源。</h2></div><span className="wb-data-note">链接只作为研究证据，不代表合作或背书。</span></div><div className="wb-evidence-grid">{evidence.slice(0, 8).map((item) => <a href={item.url} key={`${item.url}-${item.title}`} target="_blank" rel="noreferrer"><span>{item.source}</span><strong>{item.title}</strong><small>支持：{item.supports.join("、")}</small></a>)}</div></section> : null}

        <div className="wb-two-column">
          <section className="wb-section wb-action-list"><div className="wb-section-heading compact"><div><p className="wb-kicker">ACTION QUEUE</p><h2>今天的行动</h2></div></div>{report.actions.map((action) => <article key={action.priority}><span>{action.priority}</span><div><h3>{action.action}</h3><p>{action.why}</p><small>{action.expectedImpact}</small></div></article>)}</section>
          <section className="wb-section" id="feedback"><div className="wb-section-heading compact"><div><p className="wb-kicker">FEEDBACK TO TOMORROW</p><h2>把今天的经验送进下一次生产。</h2></div></div><FeedbackForm /></section>
        </div>

        <section className="wb-section wb-generated" id="generated"><div className="wb-section-heading"><div><p className="wb-kicker">FACT-CONSTRAINED CONTENT</p><h2>当日草稿与质量闸门</h2></div><span className="wb-data-note">最多两篇；每篇独立通过证据、事实、IP、重复度与链接检查。</span></div>{drafts.length ? <div className="wb-draft-list">{drafts.map((item) => {
          const draftSlug = item.slug || `/${item.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
          const draftPublication = publications.find((publication) => publication.slug === draftSlug.replace(/^\//, ""));
          return <article className="wb-generated-grid" key={draftSlug}><div className="wb-generated-copy"><p className="wb-kicker">{draftPublication?.slot === "afternoon" ? "AFTERNOON" : "MORNING"} DRAFT</p><h3 className="wb-ai-title">{item.title}</h3><p>{item.heroMarkdown}</p><a className="wb-primary-link" href={draftPublication?.path ?? `/workbench/preview/${encodeURIComponent(draftSlug.replace(/^\//, ""))}`}>打开完整内容</a></div><aside className="wb-quality-panel"><p>WORDS</p><strong>{item.quality.wordCount}</strong><p>QUALITY GATE</p>{item.quality.checks.map((check) => <span className={check.passed ? "passed" : "failed"} key={check.id}>{check.passed ? "✓" : "×"} {check.label}</span>)}</aside></article>;
        })}</div> : <div className="wb-empty-state">等待经过事实约束的英文草稿。</div>}</section>

        <section className="wb-section" id="performance"><div className="wb-section-heading"><div><p className="wb-kicker">SEARCH → ACTION</p><h2>真实表现与研究代理分开呈现。</h2></div></div>{report.performance.length ? <div className="wb-performance-grid">{report.performance.slice(0, 6).map((row) => <article key={`${row.url}-${row.query}`}><div><span>{row.query}</span><strong>{row.position.toFixed(1)}</strong><small>平均排名</small></div><dl><div><dt>曝光</dt><dd>{row.impressions}</dd></div><div><dt>点击</dt><dd>{row.clicks}</dd></div><div><dt>CTR</dt><dd>{(row.ctr * 100).toFixed(1)}%</dd></div></dl><p>{row.recommendedAction}</p></article>)}</div> : <div className="wb-empty-state">Search Console 当前不可读或没有可见行；没有推测数据。</div>}</section>

        {report.caveats.length ? <footer className="wb-caveats"><strong>数据与发布声明</strong>{report.caveats.map((caveat) => <span key={caveat}>{caveat}</span>)}</footer> : null}
      </div>
    </main>
  );
}
