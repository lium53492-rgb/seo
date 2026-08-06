# SEO Growth Workbench

## Purpose

The workbench turns research and observed performance into one auditable daily
page release. The unattended contract targets exactly one distinct new page per
Asia/Shanghai day, automatically evaluates fallback candidates, and resumes a
consistent partial run. Missing metrics remain unavailable and do not by
themselves block a new intent; truth, IP, originality, review, repository,
deployment, and live-page gates remain mandatory.

## Actual architecture

The production scheduler uses a 09:15 primary Codex desktop automation and
18:30 / 21:30 recovery passes. All runs use the same daily state contract, so the
recovery run resumes an incomplete page and never creates a second page after
the day is complete. Vercel serves the site and the read-only workbench; it does
not run the research pipeline. `vercel.json` intentionally contains no cron job.

```text
Codex desktop automation
-> daily:state (start or resume)
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
-> exact Git revision check on LoreLens
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
  impressions and clicks, landing UV, and qualified outbound clicks.
  Unavailable values render as `—`, not zero.
- Official Google Trends relative-interest observations when collected. A
  Trends value is not monthly search volume; missing access stays unavailable.
- The committable decision view contains exact-page Search Console, indexed
  URL Inspection, page-level landing UV, qualified outbound aggregates, and
  boolean attribution readiness/blocking state. The complete commercial
  funnel remains available only through the authenticated private API and
  process memory.
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
- Page count, landing UV, and exact-page Search Console impressions remain
  prioritization signals; they do not independently block a distinct new page.
- An update requires an observed Search Console row for the exact target page.
- A broken attribution join blocks publication. The public snapshot exposes
  only that boolean blocker, never callback counts or event detail.
- Consolidation additionally requires distinct source/target pages, an
  overlapping query observed on both pages, at least 20 exact-page impressions
  for each page in the same finalized period, and a successfully fetched,
  indexable, same-site self-canonical target in URL Inspection. Without all of
  those signals, the decision must remain `observe`; no redirect is generated.
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

`growth:check` and `growth:collect` authenticate to the private attribution APIs with the machine-only `SEO_AUTOMATION_TOKEN`. Generate it from at least 32 random bytes and configure the same value in Vercel and the trusted Codex environment. Keep `WORKBENCH_PASSWORD` only when people need interactive workbench access; the automation never reads it. If the human password is absent, every `/workbench` page fails closed with `404` and every `/api/workbench` route fails closed with `503`, in every environment. The bearer token does not unlock either route family.

Each collected page now includes both finalized exact-page Search Analytics and the indexed-version URL Inspection result. URL Inspection is not a live-page test; unavailable credentials or an unknown Google-index version remain explicit instead of being treated as an indexing failure.

`growth:collect` writes public schema version 2. The private attribution report
is projected in memory, and the file retains only exact-page GSC, sanitized URL
Inspection, aggregate landing UV, aggregate qualified outbound, and boolean
decision states. The builder can read a legacy schema-version 1 snapshot for
migration, but any report it writes contains only the schema-v2 public
projection. The public URL Inspection projection drops sitemap references,
removes canonical credentials/query/fragment data, and retains a canonical only
when it is same-origin with the inspected page.

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
