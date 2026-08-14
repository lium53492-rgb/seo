# Revenue-first SEO engineering workflow

This repository has one production path. It targets an independent English searcher job, publishes at most one reviewed answer per Shanghai day, and measures the path from search to revenue without turning missing data into zero.

## Acquisition path

```text
Independent trial-ready search intent
-> indexable SEO landing page
-> user clicks /go/novelai/{slug}
-> NovelAI with UTM + seo_click_id
-> trial / signup / purchase callback
-> daily funnel report
```

The bare homepage is a crawlable first-party guide hub. It returns its own 200
page, links to the published SEO guides, and must never automatically redirect
a visitor off-site. Each content page still answers a useful search question on
its own. The attributed conversion path begins only when a visitor intentionally
clicks a NovelAI CTA on an SEO page.

## Single source of truth

- `data/config/seo-policy.json`: scoring weights, trial/revenue gates, content limits, page cadence, and required review checks.
- `data/config/product-facts.json`: approved product facts, constraints, and forbidden claim patterns.
- `data/growth/YYYY-MM-DD.json`: one immutable, all-published-page snapshot over complete Shanghai calendar days.
- `data/research/YYYY-MM-DD.json`: evidence, candidates, funnel snapshot, content strategy, and one review-required draft.
- `data/reports/YYYY-MM-DD.json`: scored opportunities, observed/unavailable metrics, draft state, and publication state.
- `data/reviews/YYYY-MM-DD.json`: independent editorial decision and four required review checks.
- `data/pages/<slug>.json`: published content only. New schema-version 2 pages require a matching approval record.

The TypeScript product-fact module is only a typed wrapper around the JSON catalog. The report builder and the app therefore read the same product truth.

## Intent model

Every policy-version 4 candidate records public evidence references and discrete signals. The scorer, not the generating model, derives separate 0-100 values for:

- demand proxy;
- competition proxy;
- product fit;
- trial intent;
- revenue intent;
- intent specificity;
- originality;
- IP risk;
- cannibalization risk.

Product signals must map to approved product fact IDs. Search evidence must directly support the candidate and come from at least two independent domains. The candidate also records a specific rationale for each dimension so an editor can audit why each signal was selected. Demand and difficulty remain labelled research proxies because they are not observed Search Console metrics.

A new page is eligible only when all policy-v4 hard gates pass. Raw model-supplied product, trial, revenue, specificity, originality, IP, and cannibalization scores are ignored. Traffic potential cannot compensate for weak trial intent, a broad informational task, unsupported product fit, IP risk, or an intent already owned by another page.

## Two-stage release

1. `npm run growth:collect`
   queries every published page for the same 28 completed Shanghai days ending after the policy-defined finalized-data lag and writes an immutable portfolio snapshot. A missing credential or source creates an explicit unavailable entry. Run `npm run growth:check` first after any credential or callback change.
2. `npm run trends:check`, then
   `npm run trends:collect -- --research data/research/YYYY-MM-DD.json`
   enriches that day's research input with the official US BigQuery public
   Trends snapshot. Only an exact `top_rising_terms` match qualifies; top-only,
   not-observed, and unavailable results do not authorize publication. The
   persisted snapshot is a compact projection signed by the configured
   service account; unavailable attempts leave research unchanged for retry.
3. `npm run research:build -- data/research/YYYY-MM-DD.json`
   validates the all-page portfolio, its create/improve/consolidate/observe
   decision, evidence, candidates, product claims, and content quality, then
   writes a report with `ready_for_review`. It never writes a public page.
4. An independent human or explicitly identified Codex editor reviews search intent, product truth, conversion path, source accuracy, and the digest-bound Trends snapshot, then creates `data/reviews/YYYY-MM-DD.json`.
5. `npm run research:publish -- data/reports/YYYY-MM-DD.json data/reviews/YYYY-MM-DD.json`
   verifies the approval artifact and writes a schema-version 3 page.
6. `npm run verify`
   runs deterministic tests, TypeScript, and the production Next.js build.
7. Push only the intended artifacts and code. Verify Vercel READY, rendered H1, canonical, attributed CTA, JSON-LD, and sitemap inclusion before reporting production success.

## Runtime structure

```text
app/[slug]/page.tsx                         static SEO route, JSON-LD, and landing beacon
app/api/analytics/landing-view/route.ts     first-party landing pageview/UV ingestion
app/api/cron/landing-analytics/[phase]/route.ts protected daily coverage rollover
app/go/novelai/[slug]/route.ts              attributed redirect + background durable outbound write
app/api/attribution/conversion/route.ts     protected, idempotent trial/signup/purchase callback
app/api/attribution/probe/route.ts          signed NovelAI callback handshake with no funnel mutation
app/api/attribution/report/route.ts         protected page-period funnel JSON
app/api/attribution/readiness/route.ts      protected live configuration and source probe
app/workbench/                              research, review, funnel, and status views
lib/seo/page-store.ts                       published-page schema guard
lib/seo/attribution.ts                      destination allowlist and attribution contract
lib/seo/attribution-store.ts                atomic Upstash attribution + landing aggregates
lib/seo/search-console.ts                   official finalized exact-page search API reader
lib/seo/landing-analytics.ts                preferred-source selection and whole-period fallback
lib/seo/vercel-analytics.ts                 optional page-level UV/pageview API fallback
lib/seo/growth-funnel.ts                    observed/unavailable funnel composition
scripts/build-free-research-report.mjs      research -> review-required report
scripts/publish-reviewed-page.mjs           approved report -> published page
scripts/collect-growth-funnel.mjs           private live funnel collector for automation
scripts/collect-growth-portfolio.mjs        immutable all-page 28-day feedback snapshot
scripts/check-growth-readiness.mjs          private end-to-end source readiness check
scripts/probe-novelai-callback.mjs          non-business callback boundary acceptance probe
scripts/lib/seo-policy.mjs                  deterministic scoring and hard gates
docs/seo/research-signal-contract.md        evidence schema, score formulas, and examples
tests/                                      policy, attribution, and release-boundary tests
```

## Metadata and structured data

Use native Next.js metadata for title, description, canonical, Open Graph, and Twitter fields. Use `next-seo` for `ArticleJsonLd` and `FAQJsonLd`. The visible FAQ and its structured data are generated from the same page object, so they cannot drift.

## Measurement contract

- Search Console supplies finalized impressions, organic clicks, CTR, and position through its official API, filtered to the exact source page and reporting period.
- First-party landing analytics is the preferred UV source on the same
  source-page and period dimensions. Upstash keeps exact Shanghai-day pageview
  counters and page-scoped Redis HyperLogLog membership; UV therefore has
  approximately 0.81% standard error.
- `FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT` is an immutable rollout watermark.
  The one `CRON_SECRET`-protected `0 16 * * *` UTC (Shanghai 00:00) rollover closes the previous
  Shanghai day and opens the current day in one cron invocation;
  its validation window allows Vercel's within-hour scheduler drift. A period
  is observed only when it is after the watermark and every included day has
  both checkpoints. A missing checkpoint is unavailable, not zero. If the
  preferred source cannot cover the request, a configured Vercel Web Analytics
  result may replace it only for the whole requested period. Provider values
  are never added or partially spliced.
- The rollover proves landing-measurement continuity only. It does not run the
  research, review, publication, or release pipeline; those remain on the
  local Codex schedule.
- The landing endpoint's Redis fixed-window limiter protects metric writes
  from local bursts. It is not a platform-level cost or attack-control
  guarantee; that boundary remains Vercel WAF/DDoS and project configuration.
- `/go/novelai/{slug}` creates a `seo_click_id`, persists a bot-resistant outbound signal by acquisition page/day, and forwards UTM fields plus that ID to NovelAI.
- NovelAI must retain the ID and send it with trial, signup, and payment events. Only the outbound-to-revenue segment is joined event by event with `seo_click_id`.
- After NovelAI deployment or secret rotation, its server environment runs `npm run growth:probe`. The signed probe is stored outside funnel cohorts and must be recent before readiness reports `outboundToRevenue` or `fullLoop`.
- Upstash stores idempotent attribution events, landing pageview counters,
  page-scoped landing HLL aggregates, and page/day cohorts for 400 days. Raw
  landing visitor IDs are not persisted in those aggregates.
- `/workbench/attribution` combines those sources. A page can only show a numeric zero after the corresponding source was queried successfully for an explicit period; missing credentials, callbacks, or API access remain unavailable.
- The daily report records each funnel metric as either `observed` with a source or `unavailable` with a reason.
- Before generating a new daily draft, run `npm run growth:check` and `npm run growth:collect`. The report builder requires a snapshot covering every published page for one identical complete-Shanghai-day period and the configured three-day lag. Page count, landing UV, and exact-page Search Console impressions inform prioritization but do not independently block a distinct new page.
- Any orphan conversion callback blocks publication until the join defect is repaired. Public unauthenticated workbench views replace every page-level portfolio metric with an explicit protected/unavailable entry.

See `docs/seo/revenue-attribution.md` for the cross-repository callback contract.

## Bug control

`npm run test` proves that inflated AI scores cannot bypass weak evidence signals, weak intent cannot pass, cannibalized intent consolidates, the redirect cannot target an unapproved domain, and a report cannot publish without a separate approval artifact. `npm run check` catches type and contract drift. `npm run build` proves App Router, static page generation, metadata, structured data, and dynamic routes compile together.

Production verification remains separate from local verification. A local green build is not a deployment claim.
