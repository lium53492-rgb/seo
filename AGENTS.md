# SEO project operating instructions

Use this file as the repository entry point for every future SEO action. Read
the listed sources before researching, editing, publishing, reviewing, or
reporting. Do not rely on a single chat turn or a historical planning document.

## Source priority

Resolve conflicts in this order:

1. The current user request and any active automation instructions.
2. This file and the current working tree, including `git status` and current
   routes/components.
3. `data/config/seo-policy.json`, `data/config/content-architecture.json`,
   `data/config/presentation-recipes.json`, `data/config/product-facts.json`,
   `docs/seo/content-architecture.md`, `docs/seo/dnd-content-boundary.md`,
   `docs/seo/content-production-sop.md`, `docs/seo/free-research-robot.md`,
   `docs/seo/research-signal-contract.md`, and
   `data/seo-feedback/pending.md`.
4. Unconsumed files in `data/seo-feedback/inbox/`, then current
   `data/pages/`, research reports, and the active seven-day plan.
5. Older READMEs, workflows, briefs, tracker rows, and historic plans only for
   guidance that does not conflict with the sources above.

The older project documents describe an earlier story-specific landing-page
flow. Do not reintroduce its retired deep links, third-party story claims,
three-link rule, or unsupported feature descriptions without current product
evidence and user authorization.

## Mandatory preflight

Before a new page or update:

- Read every source-of-truth file in priority item 3.
- Read all unconsumed feedback entries and record their adoption/rejection
  before marking them consumed.
- Inspect current published pages, current-day growth/research/report/review/
  page/PDF paths, and `git status`; never overwrite, delete, stage, commit, or
  push unrelated user work.
- Treat `demandScore` and `difficulty` only as transparent 0-100 public-web
  research proxies. Keep observed Search Console data separate; when the
  logged-in browser has no visible rows, record `performance: []` and the
  reason rather than inventing data.
- Exclude unlicensed third-party IP. Use only approved `factIds` and never
  claim unapproved availability, price, privacy, latency, voice technology,
  real-time operation, groups, friends, multiplayer, or safety guarantees.
- Future SEO production is D&D-player-first and uses an adult hobbyist tone.
  Every candidate must include the approved `dnd_content` and
  `adult_tabletop_audience` qualifiers, then solve a specific player or Game
  Master job rather than a generic children's story task. Those zero/low-weight
  direction qualifiers cannot replace an approved capability fact or clear the
  product-fit threshold by themselves. The direction fact does not establish official Dungeons & Dragons
  affiliation or trademark permission. New production is original
  tabletop-fantasy only until the artifact schemas implement and test an exact
  SRD version, license URL, and required Creative Commons attribution contract.
- Record the complete search-to-revenue funnel as observed or unavailable.
  The shared SEO-tool account is a research source, not a UV or revenue source.
- Aggregate Search Console and landing UV by source slug and reporting period.
  Use `seo_click_id` only for the qualified-outbound-to-revenue event chain.
- Prefer first-party landing analytics stored in Upstash: pageviews are exact
  daily counters and UV is a privacy-minimized, page-scoped Redis HyperLogLog
  estimate with approximately 0.81% standard error. Treat
  `FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT` as an immutable coverage
  watermark. A period is observed only when it begins on or after the first
  complete Shanghai day allowed by that watermark and every included day has
  valid start/end checkpoints written by the `CRON_SECRET`-protected daily
  Vercel rollover job. That single `0 16 * * *` UTC (Shanghai 00:00) run closes the previous
  Shanghai day and opens the current one, allowing the platform's within-hour
  schedule drift. A missing checkpoint makes the first-party result
  unavailable, not zero. Vercel Web Analytics may replace it only when it
  observes the entire requested period; never add provider values or splice
  partial periods together. This Vercel job proves measurement coverage only;
  content research and publishing remain on the local Codex schedule.
- Treat the Redis fixed-window guard on landing-view writes only as metric
  integrity protection. It does not provide platform-level attack or cost
  protection; that boundary remains the Vercel WAF/DDoS layer and its project
  configuration.
- Run `npm.cmd run growth:collect` before candidate research. The resulting
  `data/growth/YYYY-MM-DD.json` must cover every published page over the same
  complete Shanghai-day window, ending after the configured finalized-data
  lag, even when an entry is explicitly unavailable. URLs with a validated
  retirement receipt stay in the separate `retiredUrls` Search Console/URL
  Inspection monitor; they never count as active pages or readiness evidence.
- After growth collection, run `npm.cmd run trends:check` and then
  `npm.cmd run trends:collect -- --research data/research/YYYY-MM-DD.json`
  before the report builder; use the default `--stdout` mode with repeated
  `--candidate` arguments during discovery. The collector reads
  Google's official US BigQuery `top_terms` and `top_rising_terms` public
  tables for discovery and enrichment. Missing credentials, query failure, or
  no exact normalized rising-term match must stay explicit and must not be
  replaced with public-web proxy scores. Research enrichment is atomic and
  must refuse to overwrite existing `trendCollection` or `trendSignals`.
  An unavailable attempt must print diagnostics and leave the research file
  unchanged so a later same-day retry remains possible. Persist only the
  compact schema-v2 result counts/digests, exact candidate matches, and bounded
  deterministic D&D leads, never the full DMA result. The collector signs the
  canonical snapshot digest with the configured BigQuery service-account key;
  the builder, daily coordinator, and both publisher reads must load the same
  server-only environment and verify the configured client email, derived
  public-key fingerprint, and RSA-SHA256 signature. A self-hash alone is not
  provider provenance.
- Run `npm.cmd run growth:check` after changing analytics credentials or
  callbacks. Run `npm.cmd run growth:probe` from the NovelAI server
  environment after callback deployment or secret rotation. Do not describe
  the revenue loop as ready unless the protected probe observes Search
  Console, landing UV, and the attribution store and a recent signed NovelAI
  callback handshake exists.
- For unattended `create_page` production, require the current all-page
  portfolio to have zero unavailable pages, observed exact-page Search Console
  and landing UV states for every published page, and a ready attribution join.
  Observed zero remains valid evidence; unavailable does not. Stop rather than
  publishing while the measurement loop is disconnected, and always stop on
  orphan conversion callbacks.

## Content and page requirements

- One distinct search intent and one H1 per page. Select a new answer, not a
  near-duplicate keyword variant.
- Prefer mature tabletop jobs such as campaign preparation, at-table improv,
  encounter and NPC craft, character motivation, player agency, continuity,
  and session repair. Do not revive child-directed workshop, sticker, mascot,
  or generic "choose a story" framing for new production.
- New work must use content-strategy schema 2 and draft schema 2. Define the
  reader state, outcome, stable `painPointId`, specific pain point, answer archetype, opening move, ordered
  section roles/formats, FAQ jobs, signature module, nearest-page differences,
  and presentation recipe before writing prose. The builder must reject text,
  structure, signature, or recipe reuse that violates the architecture policy.
- `pagePattern` describes a content family only. It must not choose a visual
  skin. All reader-visible template copy belongs to the reviewed draft, and
  gallery/companion behavior is explicit per recipe with no global default.
- Structured `steps`, `checklist`, `examples`, and `comparison` sections need
  explicit Markdown list markers and at least two semantic blocks. The
  production subset is paragraphs, marked lists, and paired `**strong**`
  spans; headings, links, code, raw HTML, italics, and unmatched markers are
  publication errors. Do not relabel prose as a list. Fact IDs must be unique,
  and every visible architecture field is subject to product-claim,
  word-count, and novelty gates.
- New candidates must use policy version 4. Each candidate must cite at least
  two directly supporting evidence records from two independent domains and
  provide the required decision-evidence signals and rationales. The builder,
  not the generating model, derives product-fit, trial-intent, revenue-intent,
  intent-specificity, originality, IP, and cannibalization scores.
- A selected `create_page` draft must have a same-day schema-v2 Google Trends
  observation derived from Google's official BigQuery public dataset. Only an
  exact normalized match in US `top_rising_terms` can clear the Trends gate.
  `top_terms` rows and non-exact matches are discovery leads only. Per-DMA
  `score` values must never be relabelled as nationwide `relativeInterest`.
  Missing credentials or a failed/stale collection means `unavailable`; a
  successful collection without the exact term means `not_observed`. Both
  mean no publication and neither proves zero search volume. Legacy
  schema-v1 Trends UI signals remain historical/manual compatibility input and
  cannot clear this unattended v2 gate.
- From the date configured in `seo-policy.json`, a selected `create_page`
  candidate also needs a same-day, page-specific, independent
  `breakout_page` evidence record. Its numeric signal, unit, basis, detail,
  source URL, and exact supported keyword must survive into the report and be
  revalidated by the publisher.
- The English draft must be review-required, 600-1,000 words, have at least
  four sections and three FAQs, use approved facts only, contain a real CTA,
  and pass the builder's source, IP, duplicate, slug, and link gates.
- From 2026-08-11, every schema-2 draft that can become a schema-3 page must
  carry the exact digest-bound `ipBoundary` original-only contract. Builder,
  publisher, and page store independently scan visible copy for configured
  third-party references and child-directed framing. Editorial approval must
  separately pass `original-ip-boundary` and `adult-tabletop-audience` checks.
- A new-page CTA must name the page-specific outcome and pass an independent
  similarity gate. Generic labels such as `Learn more`, `Get started`, or
  generic `Explore`/`Try NovelAI` copy cannot authorize publication.
- `specimen-catalog-v1`, `museum-cobalt`, and every recipe/palette listed in
  the policy retirement arrays are hard-blocked even when history is missing.
- From the configured visual-audit date, editorial approval needs digest-bound
  1440x1000 and 390x844 screenshot receipts. The publisher verifies the files
  and hashes, H1 line/viewport limits, first-screen CTA, overflow, raw Markdown,
  signature visibility, and repeated-numbered-block limit both before and
  inside the publication guard.
- Keep the H1, main answer, sections, FAQ, CTA, and canonical metadata in the
  initial rendered HTML. Verify the current template rather than assuming an
  old workflow still matches it.
- The bare homepage is a crawlable first-party guide hub and must return its
  own content without automatically redirecting visitors off-site. The
  conversion path is `SEO landing page -> user-initiated attributed redirect
  -> NovelAI`; SEO CTAs use `/go/novelai/{slug}` in a new tab. Confirm the live
  destination on each production run; do not restore the bare-homepage or
  legacy story-share redirect paths without approval.

## Daily production and release boundary

- Publish at most one new page per Shanghai day. A different keyword spelling
  is not a different intent, and an update is a separate evidence-led decision.
- A scheduled run may legitimately publish zero pages. Research and record the
  decision, but do not create a page merely to satisfy a daily count when
  Trends, measurement readiness, reader value, or rendered visual quality fails.
  After the same-day growth snapshot exists, close that decision with
  `daily:coord -- no-publish YYYY-MM-DD REASON_CODE "Specific observed reason"`.
  A valid receipt is terminal for that day; recovery must not restart the
  content chain or treat it as a published-page/deployment receipt.
- For scheduled production, follow `docs/seo/unattended-daily-publishing.md`.
  Settle any previous-day release in flight, acquire the shared daily lease,
  restore its latest checkpoint, save after
  every durable stage, and reassert lease ownership before push.
  Consistent same-day artifacts from the active daily chain are resumable; only
  conflicting or unrelated artifacts trigger the no-overwrite stop. Once one
  page exists for the Shanghai day, resumed runs verify and deliver that page
  rather than creating a second one. Lease transitions are immutable append-
  only states, and the publisher must hold the shared publication guard while
  re-reading the page corpus and daily count. Do not start or release a page at
  or after the configured 23:45 Asia/Shanghai cutoff.
  Persist `release-start` for the exact local commit before push. If it first
  verifies after midnight, that carryover occupies the new production day's
  slot. Completion requires that exact revision to equal the fetched
  `origin/main` tip.
- If same-day growth, research, report, page, or PDF artifacts already exist from
  another task, stop and report the conflict instead of overwriting them.
- The research builder may only create a `ready_for_review` report. A separate
  identified editorial approval in `data/reviews/` is mandatory before the
  publisher writes a schema-version 3 page. The approval digest binds both the
  draft and content strategy, including architecture and presentation.
- Run the research builder, publisher, and `npm.cmd run verify` before release.
  Generate, render, and visually inspect the daily PDF when required.
- The production order is growth collection, Trends discovery/enrichment,
  research build, independent review, then guarded publication. A Trends hit
  never replaces Search Console/landing-UV/attribution readiness, independent
  breakout evidence, IP and product-fact checks, content distinctness, or
  rendered visual review.
- The candidate batch must contain 8-12 semantically distinct searcher jobs and,
  after scoring and current-corpus cannibalization derivation, at least the
  daily target plus seven eligible `create_page` intents. Model-supplied
  `new_intent` labels and keyword spelling differences are not evidence of a
  distinct intent.
- A daily SEO commit may contain only that day's growth snapshot, research,
  report, review, page, and requested PDF artifacts unless the user explicitly
  expands the scope. Do not push `main` when it would also publish unrelated
  local commits. Do not claim deployment until remote push, Vercel READY,
  rendered H1/canonical/CTA checks, and sitemap inclusion are all independently
  verified. Permanent completion also requires the full release revision to be
  present in `origin/main`, every daily artifact to match that revision, and two
  complete LoreLens live-verification passes.

## Reporting and durable context

- State observed facts, proxy metrics, unavailable states, and deployment
  status precisely. Never infer production success from a local build.
- For an automation, read and update its memory file with a concise dated
  summary before returning.
- Preserve user feedback verbatim with dates, keep the feedback queue durable,
  and record the current action and any blocker in the relevant daily report.
