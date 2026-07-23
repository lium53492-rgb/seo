# Revenue-first SEO engineering workflow

This repository has one production path. It targets an independent English searcher job, publishes at most one reviewed answer per Shanghai day, and measures the path from search to revenue without turning missing data into zero.

## Acquisition path

```text
Independent trial-ready search intent
-> indexable SEO landing page
-> /go/novelai/{slug}
-> NovelAI with UTM + seo_click_id
-> trial / signup / purchase callback
-> daily funnel report
```

The SEO site is not a second product and the bare homepage is not a topic hub. Each content page must answer a useful search question on its own. Its primary business job is to send a qualified reader into the approved NovelAI experience.

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

Every candidate records separate 0-100 values for:

- demand proxy;
- competition proxy;
- product fit;
- trial intent;
- revenue intent;
- intent specificity;
- originality;
- IP risk;
- cannibalization risk.

A new page is eligible only when all policy-v3 hard gates pass. Traffic potential cannot compensate for weak trial intent, a broad informational task, unsupported product fit, IP risk, or an intent already owned by another page.

## Two-stage release

1. `npm run growth:collect`
   queries every published page for the same 28 completed Shanghai days and writes an immutable portfolio snapshot. A missing credential or source creates an explicit unavailable entry.
2. `npm run research:build -- data/research/YYYY-MM-DD.json`
   validates the all-page portfolio, its create/improve/consolidate/observe
   decision, evidence, candidates, product claims, and content quality, then
   writes a report with `ready_for_review`. It never writes a public page.
3. An independent human or explicitly identified Codex editor reviews search intent, product truth, conversion path, and source accuracy, then creates `data/reviews/YYYY-MM-DD.json`.
4. `npm run research:publish -- data/reports/YYYY-MM-DD.json data/reviews/YYYY-MM-DD.json`
   verifies the approval artifact and writes a schema-version 2 page.
5. `npm run verify`
   runs deterministic tests, TypeScript, and the production Next.js build.
6. Push only the intended artifacts and code. Verify Vercel READY, rendered H1, canonical, attributed CTA, JSON-LD, and sitemap inclusion before reporting production success.

## Runtime structure

```text
app/[slug]/page.tsx                         static SEO route and next-seo JSON-LD
app/go/novelai/[slug]/route.ts              attributed redirect + background durable outbound write
app/api/attribution/conversion/route.ts     protected, idempotent trial/signup/purchase callback
app/api/attribution/report/route.ts         protected page-period funnel JSON
app/workbench/                              research, review, funnel, and status views
lib/seo/page-store.ts                       published-page schema guard
lib/seo/attribution.ts                      destination allowlist and attribution contract
lib/seo/attribution-store.ts                atomic Upstash event and cohort persistence
lib/seo/vercel-analytics.ts                 official page-level UV/pageview API reader
lib/seo/growth-funnel.ts                    observed/unavailable funnel composition
scripts/build-free-research-report.mjs      research -> review-required report
scripts/publish-reviewed-page.mjs           approved report -> published page
scripts/collect-growth-funnel.mjs           private live funnel collector for automation
scripts/collect-growth-portfolio.mjs        immutable all-page 28-day feedback snapshot
scripts/lib/seo-policy.mjs                  deterministic scoring and hard gates
tests/                                      policy, attribution, and release-boundary tests
```

## Metadata and structured data

Use native Next.js metadata for title, description, canonical, Open Graph, and Twitter fields. Use `next-seo` for `ArticleJsonLd` and `FAQJsonLd`. The visible FAQ and its structured data are generated from the same page object, so they cannot drift.

## Measurement contract

- Search Console supplies observed impressions, organic clicks, CTR, and position, aggregated by source page and reporting period.
- Vercel Web Analytics supplies landing-page UV on the same source-page and period dimensions.
- `/go/novelai/{slug}` creates a `seo_click_id`, persists a bot-resistant outbound signal by acquisition page/day, and forwards UTM fields plus that ID to NovelAI.
- NovelAI must retain the ID and send it with trial, signup, and payment events. Only the outbound-to-revenue segment is joined event by event with `seo_click_id`.
- Upstash stores idempotent event records and page/day cohort aggregates for 400 days. Vercel Web Analytics remains the privacy-friendly UV source; Redis does not create a second visitor cookie.
- `/workbench/attribution` combines those two sources. A page can only show a numeric zero after the corresponding source was queried successfully for an explicit period; missing credentials, callbacks, or exports remain unavailable.
- The daily report records each funnel metric as either `observed` with a source or `unavailable` with a reason.
- Before generating a new daily draft, run `npm run growth:collect`. The report builder requires a snapshot covering every published page for one identical complete-Shanghai-day period. After the four-page cold start, at least one page must have observed landing UV before another new page can pass the publication gate.
- Any orphan conversion callback blocks publication until the join defect is repaired. Public unauthenticated workbench views replace every page-level portfolio metric with an explicit protected/unavailable entry.

See `docs/seo/revenue-attribution.md` for the cross-repository callback contract.

## Bug control

`npm run test` proves that weak intent cannot pass, cannibalized intent consolidates, the redirect cannot target an unapproved domain, and a report cannot publish without a separate approval artifact. `npm run check` catches type and contract drift. `npm run build` proves App Router, static page generation, metadata, structured data, and dynamic routes compile together.

Production verification remains separate from local verification. A local green build is not a deployment claim.
