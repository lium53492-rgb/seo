# Free Codex SEO research robot

This is the active zero-additional-API-cost production protocol. It uses public evidence and clearly labelled research proxies, and it publishes only candidates with a specific trial or purchase job.

## Preflight

1. Read `AGENTS.md`, `data/config/seo-policy.json`, `data/config/product-facts.json`, this file, the content-production SOP, pending feedback, and every unconsumed feedback item.
2. Inspect `git status`, all current published pages, the current-day growth/research/report/review/page/PDF paths, and the latest report.
3. Stop rather than overwrite another task's same-day artifact or unrelated local work.
4. Record Search Console, Vercel UV, outbound, trial, signup, payment, and revenue as observed or unavailable. Never convert unavailable data to zero.
5. Run `npm.cmd run growth:collect` before researching candidates. Read the resulting all-page snapshot and stop blind new-page production when the configured cold-start allowance is exhausted without observed landing UV.

## Candidate research

Use 5-12 candidates and at least five accessible evidence URLs from at least three independent domains. Every candidate must have direct `evidence.supports` coverage.

For policy version 3, every candidate needs:

- `demandScore` and `difficulty`: transparent 0-100 public-web proxies unless an observed provider metric is explicitly cited;
- `intent`: commercial, transactional, mixed, informational, or navigational;
- `funnelStage`: problem, solution, trial, or purchase;
- `conversionGoal`: qualified_outbound_click, trial_start, or purchase;
- `productFit`, `trialIntent`, `revenueIntent`, `intentSpecificity`, and `originality`;
- `ipRisk` and `cannibalizationRisk`.

New pages must pass every hard gate in `data/config/seo-policy.json`. Demand cannot override a failed trial, revenue, specificity, product, IP, or cannibalization gate.

## Content strategy and funnel

The research input uses `policyVersion: 3` and includes:

- `searcherJob`, `oneSentenceAnswer`, and `originalContribution`;
- one approved `pagePattern`;
- `productBridge`, `contextualNextStep`, and `evidenceBoundary`;
- `conversionHypothesis`, `primaryConversion`, and `measurementPlan`;
- a `portfolioDecision` with schema version 1, one of `create_page`,
  `improve_page`, `consolidate`, or `observe`, an evidence-led rationale,
  cited published slugs, and a target slug when the action changes an existing
  page;
- a schema-version 1 funnel snapshot using `source_slug+reporting_period` for search/UV aggregation and `seo_click_id` for outbound-to-revenue conversion joins.

The English draft remains 600-1,000 words, has at least four sections and three FAQs, uses only approved fact IDs, contains one real CTA, avoids prohibited claims and third-party IP, and links a relevant published first-party page when one exists.

## Build, review, publish

```text
npm run growth:collect
npm run research:build -- data/research/YYYY-MM-DD.json
npm run research:publish -- data/reports/YYYY-MM-DD.json data/reviews/YYYY-MM-DD.json
npm run verify
```

The growth command writes `data/growth/YYYY-MM-DD.json` and refuses to overwrite it. The research input embeds that snapshot or references it with `portfolioSnapshot`; the builder verifies that every published page is represented over one complete Shanghai-day period. The research command writes a review-required report and cannot write `data/pages`. Before publication, an independent editor creates a review artifact with an identified reviewer, timestamp, substantive notes, and passed checks for search intent, product truth, conversion path, and source accuracy. A Codex review must identify itself as `codex_editor`; it must never be labelled human.

The publisher enforces one page per report/day, writes schema-version 2 page data, attaches the approval record, and updates the report to `published`. Existing schema-version 1 pages remain readable but all new pages use version 2.

## Release verification

Commit only intended artifacts and code. Do not claim deployment until the remote push succeeds, Vercel reports READY, and the live page independently shows the expected H1, canonical, attributed `/go/novelai/` CTA, `Article`/`FAQPage` JSON-LD, and sitemap entry.

The scheduled run is local. The computer and Codex application must be online around 09:15 Asia/Shanghai. GitHub and Vercel continue serving published pages when the local computer is offline.
