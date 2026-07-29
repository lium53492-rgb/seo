# SEO Growth Workbench

## Purpose

The workbench turns research and observed performance into one auditable daily
decision: create, improve, consolidate, or observe. It does not promise that a
page will be published every day. Publication stops whenever the growth,
evidence, editorial, repository, deployment, or live-page gate is incomplete.

## Actual architecture

The production scheduler is the Codex desktop automation at 09:15
Asia/Shanghai. Vercel serves the site and the read-only workbench; it does not
run the research pipeline. `vercel.json` intentionally contains no cron job.

```text
Codex desktop automation
-> growth:check
-> growth:collect (all published pages, one finalized Shanghai-day window)
-> policy-v4 public-web and authorized-tool research
-> optional official Google Trends signal
-> deterministic candidate scoring
-> research:build (READY FOR REVIEW only)
-> independent approval record
-> research:publish
-> npm run verify
-> scoped Git commit and remote push
-> Vercel READY
-> live H1 / canonical / CTA / sitemap checks
-> indexing observation and authorized distribution follow-up
```

`POST /api/workbench/run` is deliberately read-only. It reports today's local
artifact and blocker state; it never pretends to start a serverless production
job.

## What the workbench shows

- The latest valid report, with proxy research scores separated from observed
  Search Console and funnel metrics.
- Today's pipeline artifacts and explicit blockers, including an invalid
  policy version or a PDF without a builder-backed report.
- A page leaderboard ordered by data availability, exact-page Search Console
  impressions and clicks, landing UV, qualified outbound clicks, and paid
  conversions. Unavailable values render as `—`, not zero.
- Official Google Trends relative-interest observations when collected. A
  Trends value is not monthly search volume; missing access stays unavailable.
- The search-to-revenue funnel. Search Console and landing UV aggregate by
  source slug and reporting period; downstream events join on `seo_click_id`.
- A durable, verbatim feedback queue. Each unconsumed item must receive an
  adopted/rejected decision and rationale before it is marked consumed.
- Separate `ready_for_review`, `published`, deployed, indexed, and backlink-live
  states. None is inferred from another.

## Data and publication gates

- Policy v4 requires 5–12 distinct candidates.
- Every candidate cites at least two directly supporting records from two
  independent domains and includes decision-evidence signals and rationales.
- The builder derives product fit, trial intent, revenue intent, intent
  specificity, originality, IP risk, and cannibalization risk.
- Demand and difficulty remain transparent 0–100 public-research proxies unless
  an authorized provider observation is explicitly recorded.
- Drafts are 600–1,000 English words with one intent, one H1, at least four
  sections, at least three FAQs, approved product facts, internal links, and an
  attributed CTA.
- After the four-page cold-start allowance, a new page requires at least one
  existing page with both non-zero landing UV and non-zero exact-page Search
  Console impressions. Direct/internal UV does not qualify.
- An update requires an observed Search Console row for the exact target page.
- Orphan conversion callbacks block publication.
- Existing same-day growth, research, report, review, page, or PDF artifacts
  are immutable unless the user explicitly authorizes replacement.

## Indexing and external distribution

Publishing makes a URL eligible for crawling; it does not guarantee Google
indexing. The release check verifies the live URL, canonical, crawlable links,
`robots.txt`, and sitemap inclusion. Search Console URL Inspection or sitemap
submission can request discovery, but `indexed` is recorded only when Google
reports it.

External links are never auto-posted to accounts or communities without
authorization. The automation may research relevant outreach targets and
prepare truthful pitches. `backlink-live` requires a publicly reachable
third-party URL that actually links to the SEO page.

## Required commands

```bash
npm run growth:check
npm run growth:collect
npm run feedback:sync
npm run research:build -- data/research/YYYY-MM-DD.json
npm run research:publish -- data/reports/YYYY-MM-DD.json data/reviews/YYYY-MM-DD.json
npm run verify
```

Run `growth:probe` from the NovelAI server environment after callback deployment
or secret rotation. Do not describe the revenue loop as ready until the
protected probe sees Search Console, landing UV, attribution storage, and a
recent signed callback handshake.

`research:build` runs `feedback:sync` first. Production submissions are stored
through GitHub, while the builder deliberately reads the local inbox; the sync
step merges the authoritative remote queue into the local tree and aborts on a
network or decision conflict so feedback cannot be silently skipped.
