import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { MessageResponse } from "@/components/ai-elements/message";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import { createDisconnectedReport } from "@/lib/seo/pipeline";
import { readLatestReport } from "@/lib/seo/report-store";
import type { RecommendedAction } from "@/lib/seo/types";
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
  connected: "已验证",
  configured: "已配置",
  missing: "待接入",
  error: "连接失败",
};

export default async function WorkbenchPage() {
  const requestHeaders = await headers();
  if (
    process.env.WORKBENCH_PASSWORD &&
    !isBasicAuthHeaderAuthorized(requestHeaders.get("authorization"))
  ) {
    notFound();
  }

  let report = createDisconnectedReport();
  try {
    report = (await readLatestReport()) ?? report;
  } catch (error) {
    report.caveats.push(
      error instanceof Error ? error.message : "读取最新真实日报失败",
    );
  }

  const top = report.opportunities[0];
  const topUsesResearchProxy = top?.metricBasis === "research_proxy";
  const evidence = report.evidence ?? [];
  const canRun =
    process.env.NODE_ENV !== "production" || Boolean(process.env.WORKBENCH_PASSWORD);
  const automationMode =
    process.env.CODEX_RESEARCH_MODE?.trim() === "true" ||
    report.opportunities.some((opportunity) => opportunity.source === "codex_research");

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
          <a className="active" href="#overview"><span>▣</span>今日总览</a>
          <a href="#opportunities"><span>↗</span>机会雷达</a>
          <a href="#brief"><span>◇</span>页面 Brief</a>
          <a href="#generated"><span>✦</span>内容草稿</a>
          <a href="#performance"><span>⌁</span>搜索表现</a>
          <a href="#integrations"><span>⊘</span>数据连接</a>
        </nav>
        <div className="wb-sidebar-note">
          <span className={`wb-dot ${report.mode}`} />
          <p>
            <strong>
              {report.mode === "live"
                ? "真实数据"
                : report.mode === "partial"
                  ? "部分真实"
                  : "等待连接"}
            </strong>
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
          <RunPipelineButton enabled={canRun} automationMode={automationMode} />
        </header>

        <section className={`wb-hero ${top ? "" : "wb-hero-empty"}`} id="overview">
          <div className="wb-hero-copy">
            <div className="wb-meta-row">
              <span className={`wb-mode-badge ${report.mode}`}>
                {report.mode.toUpperCase()}
              </span>
              <span>{report.date}</span>
              <span>
                更新于 {new Date(report.generatedAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Shanghai",
                })}
              </span>
            </div>
            <p className="wb-label">今日最高优先级</p>
            <h2>{top ? report.headline.replace("今日优先动作：", "") : report.headline}</h2>
            <p>
              {top
                ? top.reason
                : "生产模式不会用演示关键词补位。Codex 免费研究机器人或 Search Console 返回真实信号后再生成任务。"}
            </p>
            <div className="wb-hero-actions">
              {top ? (
                <>
                  <a className="wb-primary-link" href="#generated">查看生成草稿</a>
                  <a className="wb-secondary-link" href="#opportunities">比较候选词</a>
                </>
              ) : (
                <a className="wb-primary-link" href="#integrations">查看待接入权限</a>
              )}
            </div>
          </div>
          <div className="wb-score-card">
            <span>OPPORTUNITY SCORE</span>
            <strong>{top?.score ?? "—"}</strong>
            <div className="wb-score-track">
              <i style={{ width: `${top?.score ?? 0}%` }} />
            </div>
            <dl>
              <div>
                <dt>{topUsesResearchProxy ? "需求代理分" : "月搜索量"}</dt>
                <dd>{top ? (topUsesResearchProxy ? `${top.demandScore ?? 0}/100` : top.volume.toLocaleString()) : "—"}</dd>
              </div>
              <div><dt>{topUsesResearchProxy ? "竞争代理分" : "关键词难度"}</dt><dd>{top?.difficulty ?? "—"}</dd></div>
              <div><dt>产品匹配</dt><dd>{top?.productFit ?? "—"}</dd></div>
            </dl>
          </div>
        </section>

        <section className="wb-stat-grid" aria-label="关键指标">
          <article><p>真实候选词</p><strong>{report.summary.candidatesAnalyzed}</strong><span>公开研究或 API 返回并完成评分</span></article>
          <article><p>可执行机会</p><strong>{report.summary.publishableOpportunities}</strong><span>机会分 ≥ 62</span></article>
          <article><p>搜索曝光</p><strong>{report.summary.totalImpressions.toLocaleString()}</strong><span>Search Console 观测窗口</span></article>
          <article><p>自然点击率</p><strong>{(report.summary.averageCtr * 100).toFixed(1)}%</strong><span>{report.summary.totalClicks} 次点击</span></article>
        </section>

        <section className="wb-section" id="opportunities">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">OPPORTUNITY RADAR</p><h2>只展示有来源的真实关键词信号。</h2></div>
            <span className="wb-data-note">代理指标不会冒充月搜索量或 Semrush KD</span>
          </div>
          {report.opportunities.length ? (
            <div className="wb-table-wrap">
              <table>
                <thead><tr><th>关键词</th><th>意图</th><th>需求</th><th>竞争</th><th>产品匹配</th><th>机会分</th><th>动作</th></tr></thead>
                <tbody>
                  {report.opportunities.slice(0, 6).map((opportunity, index) => (
                    <tr key={opportunity.keyword}>
                      <td><span className="wb-rank">{String(index + 1).padStart(2, "0")}</span><strong>{opportunity.keyword}</strong><small>{opportunity.source}</small></td>
                      <td>{opportunity.intent}</td>
                      <td>
                        {opportunity.metricBasis === "research_proxy"
                          ? `${opportunity.demandScore ?? 0}/100`
                          : opportunity.volume.toLocaleString()}
                      </td>
                      <td><span className={`wb-kd ${opportunity.difficulty <= 30 ? "easy" : opportunity.difficulty <= 50 ? "medium" : "hard"}`}>{opportunity.difficulty}</span></td>
                      <td>{opportunity.productFit}</td>
                      <td><strong className="wb-score-inline">{opportunity.score}</strong></td>
                      <td><span className={`wb-action-tag ${opportunity.action}`}>{actionLabels[opportunity.action]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="wb-empty-state">尚无真实关键词结果。等待每日 Codex 免费研究机器人运行。</div>
          )}
        </section>

        {evidence.length ? (
          <section className="wb-section" id="evidence">
            <div className="wb-section-heading">
              <div><p className="wb-kicker">RESEARCH EVIDENCE</p><h2>每个代理分都能回到公开来源。</h2></div>
              <span className="wb-data-note">采集时间与支持的关键词一并保留</span>
            </div>
            <div className="wb-evidence-grid">
              {evidence.slice(0, 8).map((item) => (
                <a href={item.url} key={`${item.url}-${item.title}`} target="_blank" rel="noreferrer">
                  <span>{item.source}</span>
                  <strong>{item.title}</strong>
                  <small>支持：{item.supports.join("、")}</small>
                </a>
              ))}
            </div>
          </section>
        ) : null}

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
            <div className="wb-section-heading compact">
              <div><p className="wb-kicker">AUTO BRIEF</p><h2>{report.brief?.h1 ?? "等待真实关键词"}</h2></div>
              <span className="wb-mode-badge draft">BRIEF</span>
            </div>
            {report.brief ? (
              <>
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
              </>
            ) : (
              <div className="wb-empty-state">真实机会选出后才会生成 Brief。</div>
            )}
          </section>
        </div>

        <section className="wb-section wb-generated" id="generated">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">FACT-CONSTRAINED CONTENT</p><h2>真实可生产的英文页面草稿</h2></div>
            {report.draft ? (
              <span className={`wb-mode-badge ${report.draft.status === "ready_for_review" ? "live" : "blocked"}`}>
                {report.draft.status === "ready_for_review" ? "READY FOR REVIEW" : "BLOCKED"}
              </span>
            ) : null}
          </div>
          {report.draft ? (
            <div className="wb-generated-grid">
              <article className="wb-generated-copy">
                <MessageResponse className="wb-ai-title">{report.draft.title}</MessageResponse>
                <MessageResponse>{report.draft.heroMarkdown}</MessageResponse>
                {report.draft.sections.slice(0, 2).map((section) => (
                  <div key={section.heading}>
                    <MessageResponse className="wb-ai-heading">{section.heading}</MessageResponse>
                    <MessageResponse>{section.bodyMarkdown}</MessageResponse>
                  </div>
                ))}
                <a className="wb-primary-link" href={`/workbench/preview/${encodeURIComponent(report.draft.slug.replace(/^\//, ""))}`}>
                  打开完整内容预览
                </a>
              </article>
              <aside className="wb-quality-panel">
                <p>MODEL</p><strong>{report.draft.model}</strong>
                <p>WORDS</p><strong>{report.draft.quality.wordCount}</strong>
                <p>QUALITY GATE</p>
                {report.draft.quality.checks.map((check) => (
                  <span className={check.passed ? "passed" : "failed"} key={check.id}>
                    {check.passed ? "✓" : "×"} {check.label}
                  </span>
                ))}
              </aside>
            </div>
          ) : (
            <div className="wb-empty-state">每日研究选出真实机会后，Codex 会在这里生成可审核草稿。</div>
          )}
        </section>

        <section className="wb-section" id="performance">
          <div className="wb-section-heading"><div><p className="wb-kicker">SEARCH → ACTION</p><h2>已有曝光优先变成增长。</h2></div></div>
          {report.performance.length ? (
            <div className="wb-performance-grid">
              {report.performance.slice(0, 4).map((row) => (
                <article key={`${row.url}-${row.query}`}>
                  <div><span>{row.query}</span><strong>{row.position.toFixed(1)}</strong><small>平均排名</small></div>
                  <dl><div><dt>曝光</dt><dd>{row.impressions}</dd></div><div><dt>点击</dt><dd>{row.clicks}</dd></div><div><dt>CTR</dt><dd>{(row.ctr * 100).toFixed(1)}%</dd></div></dl>
                  <p>{row.recommendedAction}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="wb-empty-state">Search Console 尚无可展示的真实搜索行。</div>
          )}
        </section>

        <section className="wb-section" id="integrations">
          <div className="wb-section-heading"><div><p className="wb-kicker">DATA CONNECTIONS</p><h2>每项权限都单独验证。</h2></div></div>
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
            <strong>数据与发布声明</strong>
            {report.caveats.map((caveat) => <span key={caveat}>{caveat}</span>)}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
