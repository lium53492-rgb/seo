# Free Codex SEO research robot

This is the active zero-additional-API-cost production protocol. It uses public evidence and clearly labelled research proxies, and it publishes only candidates with a specific trial or purchase job.

## Preflight

1. Read `AGENTS.md`, `data/config/seo-policy.json`, `data/config/content-architecture.json`, `data/config/presentation-recipes.json`, `data/config/product-facts.json`, `docs/seo/content-architecture.md`, this file, the content-production SOP, pending feedback, and every unconsumed feedback item.
2. Inspect `git status`, all current published pages, the current-day growth/research/report/review/page/PDF paths, and the latest report.
3. Stop rather than overwrite another task's same-day artifact or unrelated local work.
4. Check the complete commercial funnel only through the private API and in
   process memory. The committable growth snapshot records exact-page Search
   Console, URL Inspection, aggregate landing UV, aggregate qualified outbound,
   and boolean readiness/blocking state only. Never copy trial, signup, payment,
   revenue, currency, purchase-event, callback-count, click-ID, or cohort detail
   into `data/growth` or `data/reports`.
5. Run `npm.cmd run growth:probe` from the NovelAI server environment after callback deployment or secret rotation, then run `npm.cmd run growth:check`. Full-loop readiness requires observed Search Console, Vercel landing UV, and attribution-store probes plus a recent signed NovelAI callback handshake.
6. Run `npm.cmd run growth:collect` before researching candidates. It uses the official Search Console and Vercel APIs over the configured 28-day finalized-data window, currently ending three complete Shanghai days before the run. Read the resulting all-page snapshot and use page-level UV and exact-page Search Console evidence to prioritize decisions, but do not treat page count, zero metrics, or unavailable metrics as a standalone hard block on a distinct `create_page` candidate.

## Candidate research

Use 5-12 candidates and at least five accessible evidence URLs from at least three independent domains. Give every evidence item a stable safe `id`. Every candidate must reference at least two supporting evidence IDs from at least two independent domains, and every referenced item must list that exact keyword in `supports`.

For policy version 4, every candidate needs:

- `demandScore` and `difficulty`: transparent 0-100 public-web proxies unless an observed provider metric is explicitly cited;
- `intent`: commercial, transactional, mixed, informational, or navigational;
- `funnelStage`: problem, solution, trial, or purchase;
- `conversionGoal`: qualified_outbound_click, trial_start, or purchase;
- a `decisionEvidence` object with the candidate-specific searcher job, evidence references, approved product fact IDs, discrete product/trial/revenue/specificity signals, IP class, cannibalization class, nearest published slug when relevant, and a specific rationale for every score dimension.

The builder derives `productFit`, `trialIntent`, `revenueIntent`, `intentSpecificity`, `originality`, `ipRisk`, and `cannibalizationRisk` from the versioned signal weights. Raw AI-supplied values for those fields are ignored. New pages must pass every hard gate in `data/config/seo-policy.json`; demand cannot override a failed trial, revenue, specificity, product, IP, or cannibalization gate. See `research-signal-contract.md` for the exact contract and formulas.

## Content strategy and funnel

The research input uses `policyVersion: 4`, content-strategy schema 2, and includes:

- `searcherJob`, approved `painPointId`, `readerStateBefore`, `readerOutcome`, `primaryPainPoint`, `oneSentenceAnswer`, and `originalContribution`;
- one approved `pagePattern`;
- `productBridge`, `contextualNextStep`, and `evidenceBoundary`;
- `conversionHypothesis`, `primaryConversion`, and `measurementPlan`;
- a `portfolioDecision` with schema version 1, one of `create_page`,
  `improve_page`, `consolidate`, or `observe`, an evidence-led rationale,
  cited published slugs, and a target slug when the action changes an existing
  page;
- a schema-version 2 public growth snapshot using
  `source_slug+reporting_period`; legacy schema-version 1 snapshots remain
  readable only as migration input and are projected to schema v2 before a
  report is written.

The English draft remains 600-1,000 words, has at least four sections and three FAQs, records its generation model and timestamp, uses only approved fact IDs, contains one real CTA, avoids prohibited claims and third-party IP, and links a relevant published first-party page when one exists. New drafts use schema 2 and include the complete architecture, mapped section/FAQ layers, signature module, resolved presentation contract, and page-specific surface copy. The builder owns the final route slug and binds both the draft and content strategy to the reviewed digest.

A `consolidate` decision is evidence-gated and does not itself create a
redirect. It must name distinct published `sourceSlug` and `targetSlug` values,
record at least one `overlapQueries` value observed for both exact pages, and
show at least 20 exact-page impressions for each page over the same finalized
period. The target also needs an observed URL Inspection result with successful
fetch, indexing allowed, and same-site self-referencing user and Google
canonicals. Otherwise record `observe`; the builder rejects consolidation.

## Build, review, publish

```text
npm run growth:collect
npm run research:build -- data/research/YYYY-MM-DD.json
npm run research:publish -- data/reports/YYYY-MM-DD.json data/reviews/YYYY-MM-DD.json
npm run verify
```

The readiness command probes the live private data path and exits non-zero while
the full loop is incomplete. The growth command writes a privacy-classified
schema-v2 `data/growth/YYYY-MM-DD.json` and refuses to overwrite it. The
collector holds the full private response only long enough to derive the safe
public fields and booleans. The research input embeds that snapshot or
references it with `portfolioSnapshot`; the builder verifies that every
published page is represented over one complete Shanghai-day period and the
policy-defined reporting lag. A legacy schema-v1 input is accepted for
migration, but the builder never copies its private outcome fields into the
daily report. The research command writes a review-required report and cannot
write `data/pages`. Before publication, an independent editor creates a review
artifact with an identified reviewer, timestamp, substantive notes, and passed
checks for search intent, product truth, conversion path, source accuracy,
content distinctness, presentation distinctness, the signature module, and the
rendered preview.
A Codex review must identify itself as `codex_editor`; it must never be labelled
human.

The publisher enforces one page per report/day, reruns the novelty and recipe gates against the latest page corpus, writes schema-version 3 page data, attaches the approval record, and updates the report to `published`. Existing schema-version 1/2 pages remain readable through the isolated legacy path; all new pages use version 3.

## Release verification

Commit only intended artifacts and code. Do not claim deployment until the remote push succeeds, Vercel reports READY, and the live page independently shows the expected H1, canonical, attributed `/go/novelai/` CTA, `Article`/`FAQPage` JSON-LD, and sitemap entry.

The scheduled run is local. The computer and Codex application must be online around 09:15 Asia/Shanghai. GitHub and Vercel continue serving published pages when the local computer is offline.
