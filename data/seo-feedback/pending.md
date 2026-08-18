# Pending SEO feedback

Last updated: 2026-08-18 (Asia/Shanghai)

## Operating constraints

- Publish at most one new English SEO page per day.
- Treat 20 organic visits per page as a 28-day performance target, not a guaranteed outcome. Use only observed Search Console data for evaluation.
- Do not create pages around unlicensed events, teams, players, celebrities, or other third-party intellectual property. Seasonal and topical demand may be researched only through original, generic intents.
- Future SEO-page copy and CTA labels use the approved Playworlds product identity. Current-schema pages use the versioned `/go/playworlds/{slug}` contract and exact official Steam listing; the retired NovelAI route must not be used for new pages. The signed Playworlds receiver contract is implemented and deployed, but its production shared secret and a recent product-side signed handshake are absent. A direct Steam CTA cannot provide an exact purchase joined to an individual `seo_click_id`; resolving that boundary requires either a first-party Playworlds handoff/backend or an explicitly approved aggregate Steam-reporting policy.
- The independent public SEO origin is `https://lorelens.playworlds.ai` and its crawlable routes live at `/` and `/{slug}`. The superseded `www.playworlds.ai/guides` Microfrontends plan is decision history only and must not be restored.

## Production methodology adopted 2026-07-21

- Before each daily run, read `docs/seo/content-production-sop.md` together with the required research robot instructions.
- Choose a new search intent from a topic and knowledge map, not from a keyword list alone. The brief must state the page's original contribution and the adjacent intent it deliberately does not duplicate.
- Keep the H1, main answer, supporting sections, FAQ, CTA, and canonical metadata in initial server-rendered HTML. Do not make a lazy tab or client-only fetch the sole location of useful SEO content.
- Keep a source URL and freshness date for every trend or hot signal. Use official Google sources for Google-policy claims; third-party articles are workflow inspiration, not policy evidence.
- AI may collect, structure, draft, and check. The final release decision must verify product facts, originality, IP risk, page-specific usefulness, and user feedback.
- Learn landing-page patterns as reusable structure only; do not copy copywriting, imagery, or third-party intellectual property.

## User feedback adopted 2026-08-04

- Verbatim: “seo的这个网址  前面是点开之后会直接跳转到novel.ai，  现在说不让这样了  这个你重新修改一下”
- Decision: adopted. The bare homepage now renders a first-party guide hub and keeps its navigation on this site. NovelAI redirects remain available only after an intentional CTA click from a published SEO page.

## User feedback adopted 2026-08-10

- Verbatim: 像8月7号的这种页面  就不用上线了  风格配色都不行  删除吧  我要内容能吸引人的  不是发布页面凑数的
- Decision: adopted. Retire the 2026-08-07 scene-recovery page and its museum-cobalt specimen presentation. A scheduled run may end with no publication; unavailable or unverifiable Google Trends provider evidence, or incomplete GSC/landing-UV/attribution readiness, is a hard stop, and rendered desktop/mobile appeal must be inspected rather than inferred from recipe metadata. The 2026-08-18 controlling feedback clarifies that a verified exact-keyword `not_observed` result is not such a stop.

- Verbatim: 8月1号的那个页面是最好的  其他的我都觉得不是特别好  你现在把内容分层做一做  你自己思考一下  看内容分哪些方面、每个方面具体怎么做 比较能有流量
- Decision: adopted. Preserve the August 1 page as the visual-quality benchmark and require each future page to have an intent-specific content hierarchy, mature worked example, and useful reader action rather than a reused page shell.

- Verbatim: 这些还是很普通  没有创意和新颖度  不要那种充数的  像8月1号的那个  有个黑衣人 在黑暗中  就很美式  美国人都喜欢什么风格  你多做哪些风格  最终都是为了数据
- Decision: adopted. Reject layout-only variation. Require an original character, event, or consequential object in the first screen, distinct visual worlds by intent, and observed exposure-to-action and revenue evidence instead of subjective declarations of a winner.

- Verbatim: 1、冷启动额度不是已经删除了吗  为什么还会对现在产生影响 / 2、现在我们海外也制作dnd了  后续的页面制作  都以dnd为主 / 3、以前大同小异的页面可以都删除了  但是像8月1号的不要删  其他的页面我觉得不适合玩dnd的玩家  更适合小孩
- Decision: adopted. The cold-start gate was already retired and must not be cited again. Preserve only the August 1 public SEO page, retire the remaining generic page slugs and child-directed workshop presentation, and make adult D&D players and Game Masters the primary audience within the documented product and IP boundary.

## User feedback adopted 2026-08-16

- Verbatim: “这个是我们的新产品 playworld，前面的novel.ai就不做了 页面中就不要再有novel.ai了 我们现在全部都是dnd了，也就是playworld。你把页面重新修改一下 我看还有novel.ai”
- Decision: adopted. Use the official Steam spelling **Playworlds** for the current product. Remove NovelAI from future page copy, CTA labels, and product positioning. Keep D&D as an adult tabletop audience/search reference only; do not imply official affiliation, endorsement, licensing, or 5e compatibility. Preserve dated NovelAI research and feedback as history. At this decision point the Playworlds outbound route and event/UTM contract were implemented in code while the signed callback and replacement production domain/GSC property were still pending. The receiver and LoreLens property were later deployed and verified; the current unresolved boundary is the absent production callback secret, absent recent product-side signed handshake, and Steam's inability to return an exact `seo_click_id` purchase join.

## User feedback adopted 2026-08-17

- Verbatim: “就你说的这种吧”
- Decision: adopted at the time as approval for a `www.playworlds.ai/guides` Microfrontends composition, then superseded later the same day by the more explicit domain decision below. Retain this entry as decision history; do not implement it as the current routing contract.

- Verbatim: “我现在换了个域名  是lorelens.playworlds.ai，其他的都不用了  现在专心做playworlds了”
- Decision: adopted and controlling. Use `https://lorelens.playworlds.ai` as the independent Playworlds SEO origin with root homepage, root page slugs, root robots and sitemap, and `/go/playworlds/{slug}` attribution. Do not require `www.playworlds.ai/guides`, the main product repository, or Vercel Microfrontends. Historical NovelAI and superseded routing artifacts remain auditable but cannot support future public product copy.

## User feedback adopted 2026-08-18

- Verbatim: 如果后续你自己做的任务终止  导致页面没有上线的话  那当天如果我再指导你做的话  还是可以上线的  但是你自己就不要上线了  第二个是就算一个关键词没有进入google trends 页面也是要上线的  第三个是什么情况  要如何解决  第四个是  你每天都要完成研究  可以多花点token
- Decision: adopted. A prior autonomous `completed_no_publish` may be resumed only once on the same Shanghai day after explicit user guidance; that resumed lease is owner-locked, and unattended jobs must never reopen or publish it. Every daily automation must finish an 8–12-candidate research set and durable report before recording no publication. A same-day signed Google Trends collection remains required, but an exact-keyword miss is `not_observed`, never zero, and does not block publication by itself; missing, unavailable, or unverifiable provider evidence remains explicit and fail-closed. The third issue is the revenue-attribution boundary: the SEO receiver is implemented and deployed, but the production secret and recent signed Playworlds handshake are missing, while the direct Steam destination cannot return a purchase joined to an individual `seo_click_id`. The implementation choice between a first-party Playworlds handoff for exact attribution and an explicitly approved aggregate Steam-reporting model remains a separate user/product decision; no synthetic callback or revenue event may be invented.

## User feedback awaiting intake

- 2026-08-03 (Asia/Shanghai): “后面的页面设计  可以把风格铺开  比如 暗黑风 科幻风 产品说明风 都错开做一做  然后痛点也都分散开 比如对比 说明 玩法 趣味性 作好内容分层”
- 2026-08-03 (Asia/Shanghai): “这个就比上一个好点了”
- 2026-08-03 (Asia/Shanghai): “都喜欢 先上线第三个吧  前面的后续慢慢上线”
- Entries written from the workbench are `kind: "content_guidance"`. Treat each as a direct editorial requirement for the next production: preserve the original wording, turn it into an explicit brief constraint, record whether it was adopted or rejected in the report, then set `consumedAt`. Do not reduce a content direction to a generic feedback note.
- The user plans to bring additional SEO-page research and feedback after studying external examples. Preserve this queue and add the feedback verbatim with its date when it arrives.
- The supplied 2026-07-21 SEO articles emphasize: tool-chain automation with human review, knowledge architecture over isolated keywords, crawlable primary content, landing-page pattern study, source-aware monitoring, and AI-plus-human editorial SOP. Apply the methodology above to the next daily brief and workbench repair.
- Workbench submissions are stored in `data/seo-feedback/inbox/YYYY-MM-DD.json`. Before production, process entries without `consumedAt`, record the adopted or rejected decision in the same-day report/memory, then set `consumedAt` with an ISO timestamp so feedback is not silently replayed forever.
