import type { Metadata } from "next";
import seoPolicy from "@/data/config/seo-policy.json";
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
  ["09:15 主任务启动", "先识别当天流水线阶段并续跑，再覆盖全部已发布页面读取可用的真实信号；没有数据就记录不可用原因，不能把 unavailable 当成 0。"],
  ["研究高意图候选", "先读取官方 Google Trends BigQuery 美国 DMA Top/Rising 榜单，再结合公开网页和授权 SEO 工具选择可审计证据；系统按 policy v4 确定性计算试玩、付费、具体度、产品匹配和竞争代理分。"],
  ["处理内容反馈", "逐字读取所有未消费指导，为每条记录采用或拒绝及原因，再把决定带进选题和 Brief。"],
  ["硬门槛筛选", "系统先排除宽泛信息词、弱试玩意图、产品不匹配、第三方 IP、内容蚕食和重复答案。"],
  ["生成事实受控草稿", "第一名合格机会变成 Brief、英文内容和待审页面，但此时不会写入已发布目录。"],
  ["独立编辑审稿", "人工或标明身份的 Codex 编辑器检查搜索意图、产品事实、来源和转化路径，并生成批准记录。"],
  ["测试后发布", "审批脚本写入页面；测试、类型检查、构建、线上 H1/canonical/CTA/sitemap 全部通过后才报告上线。"],
  ["18:30 / 21:30 自动恢复", "如果前序任务中断，恢复任务从共享检查点继续；如果当天页面已存在，只补 PDF 和部署验收，绝不生成第二篇。"],
  ["跟踪收录与授权分发", "上线、Vercel READY、Google indexed、backlink-live 分别记录；只在获授权渠道投放外链，不把提交收录误报为已收录。"],
  ["按数据反馈", "页面榜单比较 exact-page GSC、UV 和 Playworlds 归因出站；转化回调未接入时保持 unavailable，不伪造营收闭环。"],
];

const decisionRows = [
  ["高曝光、低点击", "重写 Title、Meta 和首屏承诺", "优先让搜索结果更容易被点击"],
  ["排名 8–20", "补充独特素材、FAQ 与内部链接", "把已有相关性推入首页"],
  ["高 UV、高试玩或付费", "扩展相邻但独立的搜索任务", "复制已经验证的用户意图，而不是复制关键词变体"],
  ["高需求、低产品匹配", "观察，不生成或发布页面", "防止为流量虚构产品能力"],
  ["关键词暗示多人/好友", "产品信号必须为空并阻断发布", "除非产品事实库明确确认该能力"],
];

export default async function WorkbenchGuidePage() {
  let report = createDisconnectedReport();
  try {
    report = (await readLatestReport()) ?? report;
  } catch {
    // The guide stays usable even when a remote report is temporarily unavailable.
  }
  const publications = report.publications?.length
    ? report.publications
    : report.publication
      ? [report.publication]
      : [];
  const latestPublication = publications[0] ?? null;
  const latestPublicationIsRetired = Boolean(
    latestPublication?.slug && seoPolicy.retiredPageSlugs.includes(latestPublication.slug),
  );
  const latestPublicationIsProductMigrationHeld = Boolean(
    latestPublication?.slug && seoPolicy.productMigrationHoldSlugs.includes(latestPublication.slug),
  );
  const retiredPreviewSlug = latestPublicationIsRetired && latestPublication?.slug &&
    report.draft?.schemaVersion === 2 && report.draft.architecture && report.draft.signatureModule &&
    report.draft?.slug.replace(/^\//, "") === latestPublication.slug
    ? latestPublication.slug
    : null;
  const latestPublicationIsLive = latestPublication?.status === "published" &&
    Boolean(latestPublication.path) && !latestPublicationIsRetired &&
    !latestPublicationIsProductMigrationHeld;

  return (
    <main className="wb-shell">
      <aside className="wb-sidebar">
        <a className="wb-brand" href="/workbench" aria-label="返回 SEO Growth OS">
          <span className="wb-brand-mark">N</span>
          <span><strong>Growth OS</strong><small>Playworlds · SEO</small></span>
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
          <p><strong>每日自动运行</strong><small>09:15 主任务 · 18:30 / 21:30 恢复</small></p>
        </div>
      </aside>

      <div className="wb-main wb-guide" id="guide">
        <header className="wb-guide-hero">
          <p className="wb-kicker">OPERATING MANUAL</p>
          <h1>每天自动完成一篇，失败后从断点继续。</h1>
          <p>每天沿同一条可恢复链路完成采集、研究、反馈、评分、写作、独立审稿和质检；候选失败会自动换下一个，任务中断会在晚间续跑。工作台会明确区分代理分、真实页面数据、部署、收录和外链状态。</p>
          <div className="wb-hero-actions">
            <a className="wb-primary-link" href="/workbench">打开今日任务</a>
            {latestPublicationIsLive ? (
              <a className="wb-secondary-link" href={latestPublication?.path}>打开最新线上页面</a>
            ) : latestPublicationIsProductMigrationHeld ? (
              <a className="wb-secondary-link" href="#publish">MIGRATION HOLD · 等待 Playworlds 重审</a>
            ) : retiredPreviewSlug ? (
              <a className="wb-secondary-link" href={`/workbench/preview/${encodeURIComponent(retiredPreviewSlug)}`}>RETIRED · 查看历史草稿</a>
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
            <article><span>01</span><h3>看今日流水线</h3><p>先确认增长、研究、日报、审稿和 PDF 哪一步存在，以及是否使用 policy v4。</p></article>
            <article><span>02</span><h3>看机会与页面榜单</h3><p>Google Trends 看 Rising 排名与 DMA 覆盖；真正的胜出页面按 GSC、UV、出站和付费观测值比较。</p></article>
            <article><span>03</span><h3>看独立状态</h3><p>READY FOR REVIEW、PUBLISHED、Vercel READY、Google indexed 和 backlink-live 互不替代。</p></article>
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
            每日研究与写作使用这台电脑上的 Codex 自动任务，因此 09:15、18:30 和 21:30 恢复窗口需要保持电脑与 Codex 应用在线。前序任务失败或超时后会由晚间任务自动续跑，不需要手动点“立即运行”；提交之后的 GitHub 构建、Vercel 上线和页面访问不依赖电脑在线。
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
          <div className="wb-guide-note"><strong>读数原则：</strong>“需求分/竞争分”来自公开研究，只用于方向判断；BigQuery Trends 的排名、涨幅与 DMA 覆盖不是全美相对热度或月搜索量，精确词未进入 Rising 25 也不等于搜索量为 0。曝光、点击、UV、试玩、付费和营收只有在对应数据源返回观测值后才显示。</div>
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
                <li>请添加网址前缀属性 <code>https://lorelens.playworlds.ai/</code> 并完成验证。</li>
                <li>为该属性配置 Search Console API 服务账号，并把账号邮箱加入属性用户。</li>
                <li>生产环境配置 client email、private key 和准确的 site URL；变更后运行 <code>growth:check</code>。</li>
                <li>每日组合快照只读取最终数据，并按同一个完整上海日窗口覆盖所有已发布页面。</li>
                <li>登录浏览器只作为 API 不可用时的显式人工核验；没有可见行就写 <code>performance: []</code> 和原因。</li>
                <li>提交 sitemap 或 URL Inspection 只是请求发现，只有 Google 明确报告后才记为 <code>indexed</code>。</li>
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
                <li>Playworlds 出站会保存 <code>seo_click_id</code>；产品转化回调尚未实现，因此不得把试玩、注册或付费标记为已接通。</li>
              </ol>
            </article>
          </div>
        </section>

        <section className="wb-section" id="publish">
          <div className="wb-section-heading"><div><p className="wb-kicker">TWO-STAGE QUALITY GATE</p><h2>自动检查和独立审稿缺一不可</h2></div></div>
          <div className="wb-publish-checklist">
            <span>✓ 至少 5 条公开证据，且来自至少 3 个独立域名</span>
            <span>✓ 每个候选词引用至少 2 条、来自 2 个独立域名的直接证据</span>
            <span>✓ 产品、试玩、付费、具体度、IP 与重复风险由 policy v4 信号确定性算分</span>
            <span>✓ 页面只使用产品事实白名单中的事实 ID</span>
            <span>✓ 不出现多人、实时、平台、价格、延迟或第三方 IP 等未批准说法</span>
            <span>✓ 正文深度达标，FAQ、标题、描述和 CTA 完整</span>
            <span>✓ 与已有页面不重复，同一关键词不会再次创建页面</span>
            <span>✓ policy v4 计算出的试玩、付费意图和搜索任务具体度达到硬门槛</span>
            <span>✓ 独立批准记录包含搜索意图、产品事实、转化路径和来源复核</span>
          </div>
          <p className="wb-guide-footnote">研究脚本只生成 READY FOR REVIEW；审批脚本读取 data/reviews 中的批准记录后才写入 data/pages。随后 GitHub 推送触发 Vercel 构建。新产品能力仍需先加入唯一事实目录。</p>
          <div className="wb-guide-note"><strong>外链边界：</strong>系统可以研究相关站点和准备真实 outreach 文案，但只有在你授权的账号、站点或合作渠道中才允许发布。第三方页面公开可访问且实际链接目标 SEO 页面后，才能记为 backlink-live。</div>
        </section>
      </div>
    </main>
  );
}
