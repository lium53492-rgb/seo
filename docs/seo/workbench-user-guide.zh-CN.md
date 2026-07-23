# SEO Growth Workbench 使用指南

线上指南：`/workbench/guide`

## 每天怎么用

1. 每天 09:15 后打开工作台，先看“今日最高优先级”。
2. 检查机会分、产品匹配和公开证据，不把代理分误读为精确搜索量。
3. 打开完整内容预览，确认剧情、角色、原创素材和 CTA 目标均真实可用。
4. 通过人工审核后再发布；`READY FOR REVIEW` 不等于已自动上线。
5. Search Console 回传后，根据曝光、点击、CTR 和排名决定次日改版。

## 六项连接

| 能力 | 当前方案 | 费用 | 作用 |
| --- | --- | --- | --- |
| Semrush | Codex 公开网页研究替代 | 0 | 关键词发现、需求与竞争代理分、证据链接 |
| Codex Research | 每日自动化 | 已有 | 热门和低竞争机会研究 |
| Google Search Console | 官方 API 自动采集，待服务账号配置 | 0 | 真实曝光、点击、CTR、排名 |
| Codex Content | 事实约束草稿 | 已有 | Brief、英文页面、FAQ、素材需求 |
| GitHub Reports | 自动提交到 `data/reports` | 0 | 每日版本记录和 Vercel 部署来源 |
| Product Analytics | Vercel Web Analytics | 0 | 页面访问、来源和地域；Hobby 不含自定义事件 |

## 数据怎样改变页面

- 高曝光、低点击：重写标题、描述和首屏承诺。
- 排名 8–20：补独特素材、FAQ 和内部链接。
- 高点击、高转化：扩展同意图的剧情和角色页面。
- 高需求、低产品匹配：只观察，不生产内容。
- 关键词包含尚未确认的多人、好友或群组能力：产品匹配分封顶 49。

## 数据连接配置

### Google Search Console

1. 添加网址前缀属性 `https://seo-pi-fawn.vercel.app/`。
2. 使用仓库中的 HTML 文件完成站点验证。
3. 在 Google Cloud 启用 Search Console API，创建服务账号和 JSON 密钥。
4. 把服务账号邮箱添加到 Search Console 属性用户。
5. 在 Vercel 的 Production 环境配置：
   - `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL`
   - `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY`
   - `GOOGLE_SEARCH_CONSOLE_SITE_URL=https://seo-pi-fawn.vercel.app/`
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

## 发布前检查

- 剧情确实存在并可打开。
- 可选角色与产品一致。
- 视觉和语音素材原创或已授权。
- CTA 指向确认过的真实入口。
- 没有虚构多人、实时、平台、价格、延迟或安全能力。
