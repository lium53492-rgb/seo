# SEO Growth Workbench 使用指南

线上指南：`/workbench/guide`

## 每天怎么用

1. 每天 09:15 主任务自动启动；若未完成，18:30 和 21:30 恢复任务会从共享断点续跑。工作台显示增长、研究、日报、审稿、PDF 和部署验收的当前阶段。
2. 再看 Google Trends、研究热点和机会分；Trends 来自美国各 DMA 的官方 Top 25/Rising 25 公共表，需求/竞争仍是代理分，二者都不是月搜索量。
3. 看 SEO 页面榜单。只有 exact-page GSC、UV、出站和付费返回观测值时才参与对应指标排序；`—` 不等于 0。
4. 打开完整内容预览，确认搜索任务、产品事实、原创素材、内链和归因 CTA 均真实可用。
5. 独立审稿后再发布；`READY FOR REVIEW`、`PUBLISHED`、Vercel `READY`、Google `indexed`、外链 `live` 是五个独立状态。
6. Search Console 和营收链路回传后，用页面级数据决定下一轮新建、优化、合并还是继续观察。

`research:build` 会先执行 `feedback:sync`，把生产工作台写入 GitHub 的反馈合并到本地 inbox。同步失败或同一条反馈出现原文/决定冲突时，构建会停止，避免工作台意见没有进入下一次生产。

## 七项连接

| 能力 | 当前方案 | 费用 | 作用 |
| --- | --- | --- | --- |
| Semrush | Codex 公开网页研究替代 | 0 | 关键词发现、需求与竞争代理分、证据链接 |
| Codex Research | 每日自动化 | 已有 | 热门和低竞争机会研究 |
| Google Search Console | 官方 API 自动采集，待服务账号配置 | 0 | 真实曝光、点击、CTR、排名 |
| Codex Content | 事实约束草稿 | 已有 | Brief、英文页面、FAQ、素材需求 |
| GitHub Reports | 自动提交到 `data/reports` | 0 | 每日版本记录和 Vercel 部署来源 |
| Product Analytics | Vercel Web Analytics | 0 | 页面访问、来源和地域；Hobby 不含自定义事件 |
| Google Trends | 官方 BigQuery 美国 Top 25/Rising 25 公共数据集 | 免费额度内 0/需 Google Cloud 项目 | 每日发现与增强；只允许精确 rising 命中通过 v2 门槛 |

## 数据怎样改变页面

- 高曝光、低点击：重写标题、描述和首屏承诺。
- 排名 8–20：补独特素材、FAQ 和内部链接。
- 高点击、高转化：扩展同意图的剧情和角色页面。
- 高需求、低产品匹配：只观察，不生产内容。
- 关键词包含尚未确认的多人、好友或群组能力：产品匹配分封顶 49。
- 页面数量、落地 UV 和 exact-page GSC 曝光继续用于判断优先级，但零值或暂不可用不会单独阻止一个意图明确、通过其余质量门槛的新页面。

## 数据连接配置

### Google Search Console

1. 添加网址前缀属性 `https://lorelens.novelai.ai/`。
2. 使用仓库中的 HTML 文件完成站点验证。
3. 在 Google Cloud 启用 Search Console API，创建服务账号和 JSON 密钥。
4. 把服务账号邮箱添加到 Search Console 属性用户。
5. 在 Vercel 的 Production 环境配置：
   - `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL`
   - `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY`
   - `GOOGLE_SEARCH_CONSOLE_SITE_URL=https://lorelens.novelai.ai/`
6. 重新部署，随后在本地配置 `WORKBENCH_PASSWORD` 并运行 `npm run growth:check`。

采集只读取 `dataState=final` 的最终数据。每日 28 天组合窗口默认延迟 3 个完整日，避免把 Google 尚未稳定的近几日数据误判为流量下降。

### Vercel Web Analytics

1. 打开 Vercel 项目的 Analytics 页面。
2. 点击 **Enable Web Analytics**。
3. 等待首次真实访问。项目已经安装并渲染 `@vercel/analytics` 采集组件。
4. 创建只在服务端使用的 Vercel Access Token，并在 Production 环境配置 `VERCEL_ANALYTICS_TOKEN`；项目和团队 ID 已列在 `.env.example`。

### 出站到营收

1. 在 Vercel Marketplace 连接 Upstash Redis，确认 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN` 已进入 Production 环境。
2. 在 SEO 项目和 NovelAI 主站服务端配置相同的 `ATTRIBUTION_SECRET`。
3. NovelAI 主站保存首次访问携带的 `seo_click_id`，并在试玩、注册、付费时回调 `/api/attribution/conversion`。
4. 重新部署后运行 `npm run growth:check`。只有 `readyFor.fullLoop=true` 才表示从搜索、UV、出站到营收的链路已完整就绪。

### Google Trends

1. 在 Google Cloud 项目启用 BigQuery API，并给采集服务账号授予运行查询任务的权限；公共 Trends 数据表保持只读。
2. 配置 `GOOGLE_TRENDS_BIGQUERY_PROJECT_ID`、`GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL` 和 `GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY`。
3. 先运行 `npm run trends:check`。该命令只检查本地配置，不联网；缺少变量时输出 JSON 并以状态码 2 退出。
4. 热点发现可先运行 `npm run trends:collect -- --stdout`，读取最多 50 条确定性 D&D 线索；也可重复传入 `--candidate "keyword"` 做精确候选核对。写好当日原始研究文件后，运行 `npm run trends:collect -- --research data/research/YYYY-MM-DD.json` 原子补入 `trendCollection` 和 `trendSignals`，已有同名字段时拒绝覆盖。显式 `--as-of` 必须与研究文件日期一致。
5. 采集器每天读取官方 `bigquery-public-data.google_trends.top_terms` 和 `top_rising_terms`。它们是美国各 DMA 的 Top 25/Rising 25，不支持任意关键词查询。DMA `score` 不能汇总或改名为全美 `relativeInterest`。
6. 持久化的 collection schema 2 不保存上万条完整 DMA 行，只保存两表行数与结果摘要、精确候选命中和最多 50 条 D&D 线索，且硬限制在 256 KiB 内。采集器用服务账号私钥做 RSA-SHA256 签名；构建、每日协调和发布都会按配置的账号与公钥指纹验签，私钥不会写入产物。
7. 自动发布的 schema-v2 Trends 门槛只接受规范化后与 `top_rising_terms.term` 完全一致的候选词。只命中 `top_terms`、近似词或没有命中都记为 `not_observed`/不发布；这只表示没有进入可用的 Rising 25，不表示搜索量为 0。
8. 凭据缺失、授权失败或查询超时时，research 模式只打印诊断并以状态码 2 退出，不写文件；服务恢复后当天可以重试。已经成功写入的 observed/not_observed 证据仍禁止覆盖。
9. 顺序固定为增长采集 → Trends 发现/增强 → 研究构建 → 独立审稿 → 发布。Trends 不替代 GSC、落地 UV、归因、独立 breakout、IP、内容差异化或视觉审查门槛。
10. 旧 schema-v1 网页信号只保留历史/人工兼容。Google Trends 官方 API Alpha 仍是限量资格，后续获批后再升级，不是当前采集器的依赖。

## 收录与外链

- 上线只表示页面可抓取，不保证 Google 收录。发布后验证线上 200、H1、canonical、CTA、robots 和 sitemap；只有 Search Console 明确报告后才记为 `indexed`。
- 可通过 URL Inspection 请求收录，并提交 sitemap；请求成功也不等于已经收录。
- 外链只发布到你授权的账号、站点或合作渠道。系统可以研究相关站点并准备真实的 outreach 文案，但不能自动群发、买链或冒充他人。
- 只有第三方公开 URL 实际指向目标 SEO 页面时，才记为 `backlink-live`。

## 发布前检查

- 剧情确实存在并可打开。
- 可选角色与产品一致。
- 视觉和语音素材原创或已授权。
- CTA 指向确认过的真实入口。
- 没有虚构多人、实时、平台、价格、延迟或安全能力。
