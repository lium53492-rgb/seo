import type { Metadata } from "next";
import { createDisconnectedReport } from "@/lib/seo/default-report";
import { readLatestReport } from "@/lib/seo/report-store";
import type { IntegrationStatus } from "@/lib/seo/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "工作台使用指南 | SEO Growth Workbench",
  robots: { index: false, follow: false },
};

const stateLabels: Record<IntegrationStatus["state"], string> = {
  connected: "已验证",
  configured: "已配置",
  replaced: "免费替代",
  missing: "待授权",
  error: "连接失败",
};

const dailySteps = [
  ["09:15 收集真实信号", "读取 Search Console、Vercel Analytics 和可用的产品转化数据；没有数据就记录不可用原因。"],
  ["研究高意图候选", "结合公开网页和 SEO 工具，给试玩意图、付费意图、搜索任务具体度、产品匹配和竞争代理分别打分。"],
  ["硬门槛筛选", "系统先排除宽泛信息词、弱试玩意图、产品不匹配、第三方 IP、内容蚕食和重复答案。"],
  ["生成事实受控草稿", "第一名合格机会变成 Brief、英文内容和待审页面，但此时不会写入已发布目录。"],
  ["独立编辑审稿", "人工或标明身份的 Codex 编辑器检查搜索意图、产品事实、来源和转化路径，并生成批准记录。"],
  ["测试后发布", "审批脚本写入页面；测试、类型检查、构建、线上 H1/canonical/CTA/sitemap 全部通过后才报告上线。"],
  ["按营收反馈", "搜索点击和落地页 UV 按页面与周期聚合；用 seo_click_id 连接 NovelAI 出站、试玩、注册、付费和营收，再反向调整下一轮选题。"],
];

const decisionRows = [
  ["高曝光、低点击", "重写 Title、Meta 和首屏承诺", "优先让搜索结果更容易被点击"],
  ["排名 8–20", "补充独特素材、FAQ 与内部链接", "把已有相关性推入首页"],
  ["高 UV、高试玩或付费", "扩展相邻但独立的搜索任务", "复制已经验证的用户意图，而不是复制关键词变体"],
  ["高需求、低产品匹配", "观察，不生成或发布页面", "防止为流量虚构产品能力"],
  ["关键词暗示多人/好友", "产品匹配最高只能到 49", "除非产品事实库明确确认该能力"],
];

export default async function WorkbenchGuidePage() {
  let report = createDisconnectedReport();
  try {
    report = (await readLatestReport()) ?? report;
  } catch {
    // The guide stays usable even when a remote report is temporarily unavailable.
  }

  return (
    <main className="wb-shell">
      <aside className="wb-sidebar">
        <a className="wb-brand" href="/workbench" aria-label="返回 SEO Growth OS">
          <span className="wb-brand-mark">N</span>
          <span><strong>Growth OS</strong><small>NovelAI · SEO</small></span>
        </a>
        <nav className="wb-nav" aria-label="指南导航">
          <a href="/workbench"><span>←</span>返回工作台</a>
          <a href="#quick-start"><span>1</span>快速开始</a>
          <a href="#daily"><span>2</span>每日流程</a>
          <a href="#decisions"><span>3</span>数据决策</a>
          <a href="#connections"><span>4</span>权限连接</a>
          <a href="#publish"><span>5</span>发布检查</a>
          <a className="active" href="#guide"><span>?</span>使用指南</a>
        </nav>
        <div className="wb-sidebar-note">
          <span className="wb-dot partial" />
          <p><strong>每日自动运行</strong><small>09:15 · Asia/Shanghai</small></p>
        </div>
      </aside>

      <div className="wb-main wb-guide" id="guide">
        <header className="wb-guide-hero">
          <p className="wb-kicker">OPERATING MANUAL</p>
          <h1>你只看结果，工作台负责把研究变成行动。</h1>
          <p>每天沿同一条链路完成研究、评分、写作、独立审稿、质检和发布。你打开工作台时可以直接看到关键词为什么值得做，以及它带来的 UV、试玩和付费是否可观测。</p>
          <div className="wb-hero-actions">
            <a className="wb-primary-link" href="/workbench">打开今日任务</a>
            {report.publication?.status === "published" && report.publication.path ? (
              <a className="wb-secondary-link" href={report.publication.path}>打开最新线上页面</a>
            ) : (
              <a className="wb-secondary-link" href="#connections">查看可选数据增强</a>
            )}
          </div>
        </header>

        <section className="wb-section" id="quick-start">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">30-SECOND START</p><h2>每天只做三件事</h2></div>
          </div>
          <div className="wb-guide-cards">
            <article><span>01</span><h3>看今天为什么选它</h3><p>先看机会分、产品匹配、竞争代理分和来源，不需要逐个研究关键词。</p></article>
            <article><span>02</span><h3>看发布状态</h3><p>READY FOR REVIEW 只是待审稿；只有 PUBLISHED 才代表审批和工程闸门都已通过。</p></article>
            <article><span>03</span><h3>只处理异常</h3><p>只有闸门失败或产品事实变化时才需要你介入；其他日期保持零操作。</p></article>
          </div>
        </section>

        <section className="wb-section" id="daily">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">DAILY LOOP</p><h2>从研究到结果的每日闭环</h2></div>
            <span className="wb-data-note">自动化失败不会发布空白或演示数据</span>
          </div>
          <ol className="wb-guide-timeline">
            {dailySteps.map(([title, detail], index) => (
              <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{detail}</p></div></li>
            ))}
          </ol>
          <div className="wb-guide-note">
            <strong>零额外 API 成本的运行条件：</strong>
            每日研究与写作使用这台电脑上的 Codex 自动任务，因此 09:15 前后需要保持电脑和 Codex 应用在线。错过时可在 Codex 的自动化页面点一次“立即运行”；提交之后的 GitHub 构建、Vercel 上线和页面访问不依赖电脑在线。
          </div>
        </section>

        <section className="wb-section" id="decisions">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">DATA → DESIGN</p><h2>报告怎样改变当天的网站</h2></div>
          </div>
          <div className="wb-table-wrap">
            <table className="wb-guide-table">
              <thead><tr><th>观测信号</th><th>当天改什么</th><th>为什么</th></tr></thead>
              <tbody>{decisionRows.map(([signal, change, why]) => <tr key={signal}><td><strong>{signal}</strong></td><td>{change}</td><td>{why}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="wb-guide-note"><strong>读数原则：</strong>“需求分/竞争分”来自公开研究，只用于方向判断；曝光、点击、UV、试玩、付费和营收只有在对应数据源返回观测值后才显示。空数组和未连接一律不当作 0。</div>
        </section>

        <section className="wb-section" id="connections">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">CONNECTION CHECKLIST</p><h2>六项能力的当前状态</h2></div>
            <span className="wb-data-note">状态来自最新日报，不用猜权限是否生效</span>
          </div>
          <div className="wb-integration-grid">
            {report.integrations.map((integration) => (
              <article key={integration.id}>
                <span className={`wb-integration-icon ${integration.state}`}>{integration.name.slice(0, 1)}</span>
                <div className="wb-integration-copy">
                  <h3>{integration.name}</h3><p>{integration.detail}</p>
                  {integration.href && integration.actionLabel ? <a href={integration.href} target="_blank" rel="noreferrer">{integration.actionLabel} ↗</a> : null}
                </div>
                <strong className={integration.state}>{stateLabels[integration.state]}</strong>
              </article>
            ))}
          </div>

          <div className="wb-guide-auth-grid">
            <article>
              <p className="wb-kicker">GOOGLE SEARCH CONSOLE</p>
              <h3>免费读取真实搜索曝光与点击</h3>
              <ol>
                <li>网址前缀属性 <code>https://seo-pi-fawn.vercel.app/</code> 已完成验证。</li>
                <li>在运行 Codex 的这台电脑上保持 Google Search Console 登录。</li>
                <li>每日任务会打开最近 28 天 Performance 页面，只读取 Google 明确显示的 query × page 指标。</li>
                <li>若新站为 0 或登录失效，日报会写空值和原因，不会用代理分补位。</li>
                <li>服务账号 API 是将来的可选增强，不再阻塞研究、页面生成或发布。</li>
              </ol>
            </article>
            <article>
              <p className="wb-kicker">VERCEL ANALYTICS</p>
              <h3>查看页面 UV，并与转化主键配合</h3>
              <ol>
                <li>打开上方“启用免费统计”，登录 Vercel 账号。</li>
                <li>在 SEO 项目的 Analytics 页面点击 Enable Web Analytics。</li>
                <li>采集组件已在代码和线上部署中，无需再安装包。</li>
                <li>等待首次真实访问后查看 Visits、Pages、Referrers 和 Countries。</li>
                <li>Hobby 免费版页面访问数据可用于 UV；高质量出站由站内跳转路由记录。</li>
                <li>NovelAI 端需保存 URL 中的 <code>seo_click_id</code>，并在试玩、注册、付费时回传同一个 ID。</li>
              </ol>
            </article>
          </div>
        </section>

        <section className="wb-section" id="publish">
          <div className="wb-section-heading"><div><p className="wb-kicker">TWO-STAGE QUALITY GATE</p><h2>自动检查和独立审稿缺一不可</h2></div></div>
          <div className="wb-publish-checklist">
            <span>✓ 至少 5 条公开证据，且来自至少 3 个独立域名</span>
            <span>✓ 每个候选词都有可回溯的 evidence.supports</span>
            <span>✓ 页面只使用产品事实白名单中的事实 ID</span>
            <span>✓ 不出现多人、实时、平台、价格、延迟或第三方 IP 等未批准说法</span>
            <span>✓ 正文深度达标，FAQ、标题、描述和 CTA 完整</span>
            <span>✓ 与已有页面不重复，同一关键词不会再次创建页面</span>
            <span>✓ 试玩、付费意图和搜索任务具体度达到 policy v3 硬门槛</span>
            <span>✓ 独立批准记录包含搜索意图、产品事实、转化路径和来源复核</span>
          </div>
          <p className="wb-guide-footnote">研究脚本只生成 READY FOR REVIEW；审批脚本读取 data/reviews 中的批准记录后才写入 data/pages。随后 GitHub 推送触发 Vercel 构建。新产品能力仍需先加入唯一事实目录。</p>
        </section>
      </div>
    </main>
  );
}
