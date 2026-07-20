import type { Metadata } from "next";
import { createDisconnectedReport } from "@/lib/seo/pipeline";
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
  ["09:15 自动研究", "Codex 搜索公开网页，保留证据链接，并生成需求与竞争代理分。"],
  ["机会排序", "工作台综合产品匹配、原创性、转化意图、需求信号、竞争和风险。"],
  ["生成 Brief 与草稿", "第一名关键词自动变成页面结构和事实受控英文草稿。"],
  ["人工确认", "你只需确认真实剧情、可选角色、原创素材和最终跳转链接。"],
  ["发布与观测", "日报进入 GitHub；页面上线后由 Search Console 与 Vercel Analytics 回传结果。"],
];

const decisionRows = [
  ["高曝光、低点击", "重写 Title、Meta 和首屏承诺", "优先让搜索结果更容易被点击"],
  ["排名 8–20", "补充独特素材、FAQ 与内部链接", "把已有相关性推入首页"],
  ["高点击、高转化", "扩展相邻剧情和角色页面", "复制已经验证的搜索意图"],
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
          <p>每天打开一次、审核一个机会、确认真实素材。其他研究、评分、写作、归档和持续观测都由自动流程完成。</p>
          <div className="wb-hero-actions">
            <a className="wb-primary-link" href="/workbench">打开今日任务</a>
            <a className="wb-secondary-link" href="#connections">完成剩余授权</a>
          </div>
        </header>

        <section className="wb-section" id="quick-start">
          <div className="wb-section-heading">
            <div><p className="wb-kicker">30-SECOND START</p><h2>每天只做三件事</h2></div>
          </div>
          <div className="wb-guide-cards">
            <article><span>01</span><h3>看今日最高优先级</h3><p>先看机会分、产品匹配和证据来源，不需要逐个研究关键词。</p></article>
            <article><span>02</span><h3>打开完整内容预览</h3><p>确认页面没有虚构功能，剧情、角色和素材都能由产品团队证明。</p></article>
            <article><span>03</span><h3>决定发布或退回</h3><p>通过后交给发布流程；不通过就补充产品事实，第二天重新评分。</p></article>
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
          <div className="wb-guide-note"><strong>读数原则：</strong>“需求分/竞争分”来自公开研究，只用于方向判断；“曝光/点击/CTR/排名”只有在 Search Console 返回数据后才是真实 Google 表现。</div>
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
              <h3>连接真实搜索曝光与点击</h3>
              <ol>
                <li>打开上方 Google 授权入口，添加网址前缀属性 <code>https://seo-pi-fawn.vercel.app/</code>。</li>
                <li>选择 HTML 文件验证；仓库已经包含对应验证文件，点击“验证”。</li>
                <li>在 Google Cloud 启用 Search Console API，并创建服务账号与 JSON 密钥。</li>
                <li>把服务账号邮箱添加为该 Search Console 属性用户，再将邮箱和私钥放入 Vercel 环境变量。</li>
                <li>下一次日报出现真实 query × page 行后，状态会自动变为“已验证”。</li>
              </ol>
            </article>
            <article>
              <p className="wb-kicker">VERCEL ANALYTICS</p>
              <h3>启用免费的页面访问统计</h3>
              <ol>
                <li>打开上方“启用免费统计”，登录 Vercel 账号。</li>
                <li>在 SEO 项目的 Analytics 页面点击 Enable Web Analytics。</li>
                <li>采集组件已在代码和线上部署中，无需再安装包。</li>
                <li>等待首次真实访问后查看 Visits、Pages、Referrers 和 Countries。</li>
                <li>Hobby 免费版不含自定义事件；页面浏览数据仍可免费使用。</li>
              </ol>
            </article>
          </div>
        </section>

        <section className="wb-section" id="publish">
          <div className="wb-section-heading"><div><p className="wb-kicker">HUMAN GATE</p><h2>发布前的五项确认</h2></div></div>
          <div className="wb-publish-checklist">
            <span>□ 页面描述的剧情确实存在且可以打开</span>
            <span>□ 所有角色名称和可选状态与产品一致</span>
            <span>□ 截图、语音和视觉素材均为原创或已授权</span>
            <span>□ CTA 指向确认过的真实产品入口</span>
            <span>□ 页面没有声称未确认的多人、实时、平台、价格或技术指标</span>
          </div>
          <p className="wb-guide-footnote">通过这五项后才发布。工作台的 READY FOR REVIEW 表示“可以审核”，不表示“已自动上线”。</p>
        </section>
      </div>
    </main>
  );
}
