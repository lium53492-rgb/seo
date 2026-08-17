# Free Codex SEO research robot

This is the active zero-additional-API-cost production protocol. It uses public evidence and clearly labelled research proxies, and it publishes only candidates with a specific trial or purchase job.

## Preflight

1. Read `AGENTS.md`, `data/config/seo-policy.json`, `data/config/content-architecture.json`, `data/config/presentation-recipes.json`, `data/config/product-facts.json`, `docs/seo/content-architecture.md`, this file, the content-production SOP, pending feedback, and every unconsumed feedback item.
2. Inspect `git status`, all current published pages, the current-day growth/research/report/review/page/PDF paths, and the latest report.
3. Run `npm.cmd run daily:coord -- settle YYYY-MM-DD`, then acquire the current
   day with `npm.cmd run daily:coord -- acquire YYYY-MM-DD`, restore the shared
   checkpoint, then run `npm.cmd run daily:state -- YYYY-MM-DD`. Resume a valid partial daily
   chain at its reported next stage. Stop rather than overwrite an inconsistent
   chain, another task's artifact, or unrelated local work. Settlement scans all
   historical unresolved release markers; none expires or is forgotten.
4. Check the complete commercial funnel only through the private API and in
   process memory. The committable growth snapshot records exact-page Search
   Console, URL Inspection, aggregate landing UV, aggregate qualified outbound,
   and boolean readiness/blocking state only. Never copy trial, signup, payment,
   revenue, currency, purchase-event, callback-count, click-ID, or cohort detail
   into `data/growth` or `data/reports`.
5. After the runtime probe and callback contract are migrated to Playworlds,
   run `npm.cmd run growth:probe` from the Playworlds server environment after
   callback deployment or secret rotation, then run
   `npm.cmd run growth:check`. Until that migration is complete, record callback
   readiness as unavailable.
   Full-loop readiness requires observed Search Console, an observed landing-UV
   provider, and attribution-store probes plus a recent signed Playworlds
   callback handshake. A legacy NovelAI callback, route, or event name is not
   evidence of Playworlds readiness.
6. Run `npm.cmd run growth:collect` before researching candidates. It uses the
   official Search Console API and the landing-analytics adapter over the
   configured 28-day finalized-data window, currently ending three complete
   Shanghai days before the run. First-party Upstash analytics is preferred:
   pageviews are exact daily counters and page-scoped UV is a Redis HyperLogLog
   estimate with approximately 0.81% standard error.
   `FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT` is an immutable coverage
   watermark. The `CRON_SECRET`-protected rollover at `0 16 * * *` UTC
   (Shanghai 00:00) closes the
   previous Shanghai day and opens the current one in one call, allowing
   Vercel's within-hour schedule drift. First-party data is observed only when
   the period is after the watermark and every included day has both coverage
   proofs; otherwise it is unavailable, not zero. The rollover does not run
   research or publishing, which remains on the local Codex schedule. If the
   first-party source cannot cover the request, a configured Vercel Web
   Analytics result may replace it only for the complete requested period.
   Never add provider values or splice partial periods. The Redis fixed-window
   guard protects metric writes only; platform-level cost and attack protection
   remain the responsibility of Vercel WAF/DDoS configuration. Observed zero
   is valid, but an unattended `create_page` draft is illegal unless every
   published page has observed exact-page Search Console and landing UV states
   and the attribution join is ready. After retries, record no publication when
   any required measurement remains unavailable.
   Formally retired slugs are collected separately in `retiredUrls` with only
   Search Console and URL Inspection fields; they do not count as published
   pages and cannot improve or block active-portfolio readiness.
7. Run `npm.cmd run trends:check`, then use
   `npm.cmd run trends:collect -- --stdout --candidate "keyword"` for discovery
   or `npm.cmd run trends:collect -- --research data/research/YYYY-MM-DD.json`
   to atomically enrich a candidate file before the report builder. Candidate
   flags are repeatable; `--stdout` is the default. Configure
   `GOOGLE_TRENDS_BIGQUERY_PROJECT_ID`,
   `GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL`, and
   `GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY`. The daily collector queries Google's
   official US BigQuery public tables
   `bigquery-public-data.google_trends.top_terms` and
   `bigquery-public-data.google_trends.top_rising_terms`. Missing
   configuration, a failed query, or no relevant row stays explicit; do not
   replace it with a web proxy or an invented trend observation. Research-file
   mode refuses to overwrite existing `trendCollection` or `trendSignals`.
   To configure the local worktree from a downloaded Google service-account
   JSON, run `npm.cmd run trends:configure -- C:\path\to\service-account.json`.
   The importer validates the account, atomically preserves unrelated
   `.env.local` entries, never prints the private key, and refuses to replace
   non-empty Trends values unless an intentional `--force` is supplied.
   It also leaves the file unchanged and exits 2 when collection is
   unavailable, allowing a same-day retry after recovery.

## Candidate research

Use 8-12 candidates and at least five accessible evidence URLs from at least
three independent domains. The builder derives semantic intent fingerprints,
rejects near-duplicate jobs in the same batch, and compares candidates with the
published page corpus instead of trusting a supplied cannibalization label.
After scoring and hard gates, retain the daily target plus at least seven
eligible, semantically distinct `create_page` intents in the ordered fallback
set. Give every evidence item a stable safe `id`. Every candidate must reference
at least two supporting evidence IDs from at least two independent domains, and
every referenced item must list that exact keyword in `supports`.

For policy version 4, every candidate needs:

- `demandScore` and `difficulty`: transparent 0-100 public-web proxies unless an observed provider metric is explicitly cited;
- `intent`: commercial, transactional, mixed, informational, or navigational;
- `funnelStage`: problem, solution, trial, or purchase;
- `conversionGoal`: qualified_outbound_click, trial_start, or purchase;
- a `decisionEvidence` object with the candidate-specific searcher job, evidence references, approved product fact IDs, discrete product/trial/revenue/specificity signals, IP class, cannibalization class, nearest published slug when relevant, and a specific rationale for every score dimension.

For reports dated 2026-08-11 or later, the overseas lane is D&D-first. Every
new-page candidate must name both the adult tabletop audience and a concrete
table job: for example Game Master campaign preparation, encounter repair,
NPC differentiation, at-table improvisation, player-character hooks, agency,
party tone, or continuity. A generic AI-story candidate that merely mentions
"session" or "campaign" is ineligible. Every new candidate must include the
`dnd_content`, `adult_tabletop_audience`, and
`playworlds_current_product` qualifiers. Those zero-weight qualifiers do not
count toward product fit; the page must also cite approved, currently true
Playworlds capability facts and earn the required score from the corresponding
Playworlds capability signals.

The selected `create_page` candidate also needs a same-day schema-v2 Google
Trends observation produced from the official BigQuery collection. Only an
exact normalized candidate-term match in US `top_rising_terms` can authorize
the Trends gate. A `top_terms` row, a partial/semantic match, or a per-DMA
`score` is useful for discovery only. Never aggregate or rename DMA scores as a
nationwide `relativeInterest` value. No exact rising match is
`not_observed`/no publication; it does not mean that the keyword has zero
searches. Legacy schema-v1 Trends UI records are historical/manual
compatibility input and cannot clear the unattended v2 gate. The official
limited-access Trends API Alpha is reserved as a later provider upgrade.

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

The English draft remains 600-1,000 words, has at least four sections and three FAQs, records its generation model and timestamp, uses only approved fact IDs, contains one page-specific CTA, avoids prohibited claims and third-party IP, and links a relevant published first-party page when one exists. New D&D-first drafts must use original tabletop-fantasy people, places, creatures, symbols, and mechanics until the repository has a structured, machine-validated SRD version/license/attribution contract. Do not imply official, licensed, endorsed, or 5e-compatible status. New drafts use schema 2 and include the complete architecture, mapped section/FAQ layers, signature module, resolved presentation contract, and page-specific surface copy. Structured formats use explicit list markers; the allowed Markdown subset is paragraphs, marked lists, and paired strong spans. The builder owns the final route slug and binds both the draft and content strategy to the reviewed digest.

For reports dated 2026-08-11 or later, that schema-2 draft also carries the
exact top-level `ipBoundary` contract documented in `dnd-content-boundary.md`.
The SEO keyword and visible draft are scanned independently for configured
third-party names, while visible copy is separately scanned for child-directed
framing. The structured declaration is not a substitute for either scan or for
the editor's independent judgment.

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
npm run trends:check
npm run trends:collect -- --research data/research/YYYY-MM-DD.json
npm run research:build -- data/research/YYYY-MM-DD.json
npm run research:publish -- data/reports/YYYY-MM-DD.json data/reviews/YYYY-MM-DD.json
npm run verify
```

`trends:check` is a local configuration check: it prints JSON, makes no
network request, and exits 2 when any of the three Trends variables is absent.
`trends:collect` returns `{trendCollection, trendSignals}` in stdout mode. Its
optional `--as-of YYYY-MM-DD` uses that production date and queries
`refresh_date = as-of - 1 day`. In `--research` mode it must exactly match the
research document date, and the collection must be made on that Shanghai day.
Collection state is `observed` or
`unavailable`; per-candidate signal state is `observed`, `not_observed`, or
`unavailable`. `not_observed` uses `relativeInterest: null` and
`direction: unknown`. An exact normalized `top_rising_terms` match produces an
observed/rising signal.

Collection schema 2 persists no full DMA row set. It stores per-table row
counts and canonical result digests, exact candidate-match rows, and at most 50
deterministically selected D&D discovery leads. Each lead keeps list type,
rank, DMA coverage, applicable score/gain, and source table. A rising lead
clears only the Google Trends gate when selected exactly; every intent,
product, IP, growth, quality, and editorial gate remains independent. The
collector signs the canonical snapshot digest with RSA-SHA256 using the same
server-only BigQuery service-account private key. Artifacts contain only the
client email, derived public-key fingerprint, algorithm, and signature. The
builder, daily coordinator, and both publisher reads load the same environment
and verify that attestation; recomputing the SHA-256 digest locally is not
provider proof.

The production order is growth collection, Trends discovery/enrichment,
research build, independent review, then guarded publication. The growth
readiness command probes the live private data path and exits non-zero while
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
rendered preview. Schema-3 publication additionally requires distinct passed
checks for `adult-tabletop-audience` and `original-ip-boundary`.
A post-enforcement review also contains a visual-audit receipt bound to the
draft digest. It records 1440x1000 and 390x844 screenshot paths and hashes,
measured H1 geometry, first-screen CTA, overflow, raw-Markdown visibility,
signature visibility, and repeated-numbered-block limits. Reading the draft or
recipe metadata is not visual inspection.
A Codex review must identify itself as `codex_editor`; it must never be labelled
human.

The publisher enforces one page per report/day, revalidates the exact
schema-v2 `top_rising_terms` match and same-day breakout-page evidence, reruns
CTA/content novelty and recipe gates against the latest page corpus, then
obtains the shared publication guard and re-reads the report, review,
screenshot files, and corpus before writing.
This closes both approval-tampering and two-publisher races. It
writes schema-version 3 page data, attaches the approval record, and updates the
report to `published`. Existing schema-version 1/2 pages remain readable through
the isolated legacy path; all new pages use version 3. Publishing is rejected at
or after 23:45 Asia/Shanghai.

Google Trends is one independent demand-freshness gate. It never substitutes
for complete GSC and landing-UV observation, attribution readiness, independent
`breakout_page` evidence, product and IP truth, content/presentation
distinctness, or editorial and rendered-preview approval.

## Release verification

Commit only intended artifacts and code, persist
`daily:coord -- release-start YYYY-MM-DD FULL_GIT_SHA SLUG` before push, and do
not claim deployment until the remote push succeeds, the release revision is
the exact `origin/main` tip, and
two complete LoreLens checks independently show the exact SHA, expected H1,
canonical, approved attributed Playworlds CTA, `Article`/`FAQPage` JSON-LD,
main-root robots, `/guides/sitemap.xml` entry, `/guides/go/playworlds/{slug}` link, and non-writing HEAD
redirect to the approved Playworlds Steam listing with the complete attribution
contract. It must reject the retired `/go/novelai/` path for current-schema
pages. Until the signed Playworlds callback and the replacement production
domain/GSC property are implemented and verified, no site-wide migration or
full-loop completion may be claimed. A READY deployment from a different
Vercel project is not evidence for LoreLens.

The coordinator first verifies the publishing window, saves the complete
checkpoint, pins the commit, durably records
`releasePreparing` with its daily/page-tree Git proof, then promotes it to
`releaseInFlight`. The historical scan recognizes both a complete checkpoint
left before pinning and a pin left before the preparation state. Checkpoint-only
recovery restores exactly six artifacts, rejects any other worktree path, then
creates or reuses and pins the strict single release commit. Only feedback inbox
paths bound by validated checkpoint consumption records may also be dirty, and
they are excluded from the release tree. A complete checkpoint saved at or
after 23:45 Asia/Shanghai is never eligible for release. Before any push, the
coordinator checks out the exact target revision in a temporary detached
worktree and runs the full `npm.cmd run verify` contract there; normal
`release-start` also verifies its exact revision before pinning. A checkpoint
or a verify run against some other worktree state is not itself proof that the
target tests or production build passed. If a crash occurs
at any of those boundaries, settlement
recovers the same release and may
issue only an explicit ordinary fast-forward of the marker SHA. A new marker
requires `origin/main` to be a strict parent and the release to be exactly one
non-merge commit restricted to the six daily artifacts; a pushed commit cannot
be signed afterward. Approved source changes must be released separately first.
Fetch and push URLs must both be unique and identify `lium53492-rgb/seo`. If
`origin/main` is already a descendant, it may supersede the marker only when all
daily blobs and the entire page corpus are unchanged, the same sole daily slug
remains, and every individual non-merge descendant commit changes only
`docs/**`, `tests/**`, or root documentation-form `README`/`AGENTS.md` files.
Rename detection is disabled so both sides of a move are checked. A divergent
remote, runtime/content descendant, or
content difference is a hard stop; force push is forbidden. Final confirmation
performs two exact authoritative remote checks and never pushes a rolled-back
revision.

If an unpushed pin, preparation, or marker becomes a sibling solely because
`origin/main` advanced from its recorded base, reconciliation may construct a
replacement on the new tip only after every intervening non-merge commit passes
the docs/tests-only gate and the six artifact blobs plus both page-tree proofs
remain identical. The replacement pin uses compare-and-swap, the state history
records a sibling rebase rather than descendant supersession, and the exact
replacement SHA must pass the detached full verify before its ordinary
fast-forward push.

The scheduled run is local. The computer and Codex application must be online around 09:15 Asia/Shanghai. GitHub and Vercel continue serving published pages when the local computer is offline.
