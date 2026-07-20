import type { Metadata } from "next";
import { runDailySeoPipeline } from "../../lib/seo/pipeline";
import type { RecommendedAction } from "../../lib/seo/types";
import { RunPipelineButton } from "./RunPipelineButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SEO Growth Workbench",
  robots: { index: false, follow: false },
};

const actionLabels: Record<RecommendedAction, string> = {
  create_page: "创建页面",
  improve_page: "升级页面",
  consolidate: "合并页面",
  observe: "继续观察",
};

const integrationLabels = {
  connected: "已连接",
  demo: "演示模式",
  missing: "待接入",
};

export default async function WorkbenchPage() {
  const report = await runDailySeoPipeline();
  const top = report.opportunities[0];
  const canRun = process.env.NODE_ENV !== "production" || Boolean(process.env.WORKBENCH_PASSWORD);

  return (
    <main className="wb-shell">
      <aside className="wb-sidebar">
        <a className="wb-brand" href="/workbench" aria-label="SEO Growth OS 首页">
          <span className="wb-brand-mark">N</span>
          <span>
            <strong>Growth OS</strong>
            <small>NovelAI · SEO</small>
          </span>
        </a>
        <nav className="wb-nav" aria-label="工作台导航">
          <a className="active" href="#overview"><span>◫</span>今日总览</a>
          <a href="#opportunities"><span>↗</span>机会雷达</a>
          <a href="#brief"><span>◇</span>页面 Brief</a>
          <a href="#performance"><span>⌁</span>搜索表现</a>
          <a href="#integrations"><span>⎋</span>数据连接</a>
        </nav>
        <div className="wb-sidebar-note">
          <span className={`wb-dot ${report.mode}`} />
          <p>
            <strong>{report.mode === "live" ? "真实数据" : report.mode === "partial" ? "部分真实" : "演示数据"}</strong>
            <small>每日 09:15 · Asia/Shanghai</small>
          </p>
        </div>
      </aside>

      <div className="wb-main">
        <header className="wb-topbar">
          <div>
            <p className="wb-kicker">DAILY COMMAND CENTER</p>
            <h1>今天该做什么，一眼就够。</h1>
          </div>
          <RunPipelineButton enabled={canRun} />
        </header>

        <section className="wb-hero" id="overview">
          <div className="wb-hero-copy">
            <div className="wb-meta-row">
              <span className={`wb-mode-badge ${report.mode}`}>{report.mode.toUpperCase()}</span>
              <span>{report.date}</span>
              <span>更新于 {new Date(report.generatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" })}</span>
            </div>
            <p className="wb-label">今日最高优先级</p>
            <h2>{report.headline.replace("今日优先动作：", "")}</h2>
            <p>{top.reason}</p>
            <div className="wb-hero-actions">
              <a className="wb-primary-link" href="#brief">查看自动 Brief</a>
              <a className="wb-secondary-link" href="#opportunities">比较候选词</a>
            </div>
          </div>
          <div className="wb-score-card">
            <span>OPPORTUNITY SCORE</span>
            <strong>{top.score}</strong>
            <div className="wb-score-track"><i style={{ width: `${top.score}%` }} /></div>
            <dl>
              <div><dt>月搜索量</dt><dd>{top.volume.toLocaleString()}</dd></div>
              <div><dt>关键词难度</dt><dd>{top.difficulty}</dd></div>
              <div><dt>产品匹配</dt><dd>{top.productFit}</dd></div>
            </dl>
          </div>
        </section>

        <section className="wb-stat-grid" aria-label="关键指标">
          <article><p>候选词</p><strong>{report.summary.candidatesAnalyzed}</strong><span>今日完成评分</span></article>
          <article><p>可执行机会</p><strong>{report.summary.publishableOpportunities}</strong><span>机会分 ≥ 62</span></article>
          <article><p>搜索曝光</p><strong>{report.summary.totalImpressions.toLocaleString()}</strong><span>最近观测窗口</span></article>
          <article><p>自然点击率</p><strong>{(report.summary.averageCtr * 100).toFixed(1)}%</strong><span>{report.summary.totalClicks} 次点击</span></article>
        </section>

        <section className="wb-section" id="opportunities">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">OPPORTUNITY RADAR</p><h2>不是最低 KD，而是最值得做。</h2></div>
            <span className="wb-data-note">评分包含产品匹配、需求、趋势、难度、转化和风险</span>
          </div>
          <div className="wb-table-wrap">
            <table>
              <thead><tr><th>关键词</th><th>意图</th><th>Volume</th><th>KD</th><th>产品匹配</th><th>机会分</th><th>动作</th></tr></thead>
              <tbody>
                {report.opportunities.slice(0, 6).map((opportunity, index) => (
                  <tr key={opportunity.keyword}>
                    <td><span className="wb-rank">{String(index + 1).padStart(2, "0")}</span><strong>{opportunity.keyword}</strong><small>{opportunity.source}</small></td>
                    <td>{opportunity.intent}</td>
                    <td>{opportunity.volume.toLocaleString()}</td>
                    <td><span className={`wb-kd ${opportunity.difficulty <= 30 ? "easy" : opportunity.difficulty <= 50 ? "medium" : "hard"}`}>{opportunity.difficulty}</span></td>
                    <td>{opportunity.productFit}</td>
                    <td><strong className="wb-score-inline">{opportunity.score}</strong></td>
                    <td><span className={`wb-action-tag ${opportunity.action}`}>{actionLabels[opportunity.action]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="wb-two-column">
          <section className="wb-section wb-action-list">
            <div className="wb-section-heading compact"><div><p className="wb-kicker">ACTION QUEUE</p><h2>数据如何改变今天</h2></div></div>
            {report.actions.map((action) => (
              <article key={action.priority}>
                <span>{action.priority}</span>
                <div><h3>{action.action}</h3><p>{action.why}</p><small>{action.expectedImpact}</small></div>
              </article>
            ))}
          </section>

          <section className="wb-section wb-brief" id="brief">
            <div className="wb-section-heading compact"><div><p className="wb-kicker">AUTO BRIEF</p><h2>{report.brief.h1}</h2></div><span className="wb-mode-badge draft">DRAFT</span></div>
            <dl className="wb-brief-meta">
              <div><dt>URL</dt><dd>{report.brief.slug}</dd></div>
              <div><dt>类型</dt><dd>{report.brief.pageType}</dd></div>
              <div><dt>CTA</dt><dd>{report.brief.primaryCta}</dd></div>
            </dl>
            <p className="wb-description">{report.brief.description}</p>
            <div className="wb-checklist">
              <p>发布前必须有</p>
              {report.brief.evidenceRequired.map((item) => <span key={item}>✓ {item}</span>)}
            </div>
          </section>
        </div>

        <section className="wb-section" id="performance">
          <div className="wb-section-heading"><div><p className="wb-kicker">SEARCH → ACTION</p><h2>已有曝光优先变成增长。</h2></div></div>
          <div className="wb-performance-grid">
            {report.performance.slice(0, 4).map((row) => (
              <article key={`${row.url}-${row.query}`}>
                <div><span>{row.query}</span><strong>{row.position.toFixed(1)}</strong><small>平均排名</small></div>
                <dl><div><dt>曝光</dt><dd>{row.impressions}</dd></div><div><dt>点击</dt><dd>{row.clicks}</dd></div><div><dt>CTR</dt><dd>{(row.ctr * 100).toFixed(1)}%</dd></div></dl>
                <p>{row.recommendedAction}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="wb-section" id="integrations">
          <div className="wb-section-heading"><div><p className="wb-kicker">DATA CONNECTIONS</p><h2>从演示数据切到真实闭环。</h2></div></div>
          <div className="wb-integration-grid">
            {report.integrations.map((integration) => (
              <article key={integration.id}>
                <span className={`wb-integration-icon ${integration.state}`}>{integration.name.slice(0, 1)}</span>
                <div><h3>{integration.name}</h3><p>{integration.detail}</p></div>
                <strong className={integration.state}>{integrationLabels[integration.state]}</strong>
              </article>
            ))}
          </div>
        </section>

        {report.caveats.length ? (
          <footer className="wb-caveats">
            <strong>数据声明</strong>
            {report.caveats.map((caveat) => <span key={caveat}>{caveat}</span>)}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
