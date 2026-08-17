# Playworlds SEO Growth Workbench

A Next.js SEO landing site plus a revenue-first research-to-action workbench for
Playworlds' overseas D&D-focused content direction. New production serves adult
tabletop players and Game Masters with original, intent-specific material. Each
published page owns one independent search intent and sends qualified readers
through the attributed Playworlds Steam redirect. Historical NovelAI artifacts
and routes remain compatibility-only and cannot qualify a new Playworlds page.

## Commands

```bash
npm install
npm run dev
npm run growth:check
npm run growth:collect
npm run trends:configure -- /path/to/service-account.json
npm run trends:check
npm run trends:collect -- --stdout --candidate "keyword"
npm run trends:collect -- --research data/research/YYYY-MM-DD.json
npm run feedback:sync
npm run daily:state
npm run daily:coord -- status
npm run verify
```

## Workbench

Open `/workbench` to inspect the latest persisted production report. With no
external credentials or report configured, the UI shows a disconnected state
with unavailable metrics; it never substitutes demo values or turns missing
observations into zero.

Open `/workbench/guide` for the Chinese operating manual, the daily review
checklist, the data-to-design decision rules, and direct authorization links.

The default production order is:

```text
growth snapshot
-> official Google Trends BigQuery discovery/enrichment
-> Codex public-web research
-> source URLs + transparent demand/competition proxy scores
-> opportunity scoring
-> recommended action
-> fact-constrained page brief
-> GitHub JSON report
-> Vercel workbench refresh
```

The primary Codex desktop automation runs every day at 09:15 Asia/Shanghai,
with idempotent recovery passes at 18:30 and 21:30. `daily:state` resumes a consistent
partial run and prevents a second page for the same Shanghai day. A shared
`daily:coord` lease and checkpoint lets isolated automation worktrees hand off
without racing. Lease transitions are immutable append-only states, and the
publisher holds the same cross-worktree guard while rechecking the daily page
count. The primary
run collects one all-page growth snapshot, researches the public web, writes a
review-required English draft, and builds a durable report. A separate approval
artifact is mandatory before publication. The builder blocks unsupported
product claims, weak trial/revenue intent, duplicate intent, unapproved facts,
and broken attribution joins. Page count, exact-page Search Console impressions,
and landing UV remain prioritization evidence rather than a hard expansion
gate. The workbench labels research values as proxy scores; they are not monthly
search volume, CPC, Google data, or Semrush KD. See
`docs/seo/free-research-robot.md` for the evidence and scoring protocol and
`docs/seo/unattended-daily-publishing.md` for retry, recovery, and exact-release
verification.

These schedules are local Codex jobs, so unattended production requires the
computer and Codex application to remain online during a publishing window.

The dashboard keeps official Google Trends observations separate from keyword
volume, ranks published pages only with observed page-level data, and exposes
today's artifact/blocker state. Daily Trends collection reads Google's US
BigQuery `top_terms` and `top_rising_terms` public tables. Those tables contain
the Top 25 and Rising 25 terms per DMA, not an arbitrary-keyword or nationwide
volume service: a DMA `score` is never presented as national relative interest,
and no exact match means `not_observed`, not zero demand. Publishing,
Vercel deployment, Google indexing, and a live third-party backlink are
independent statuses; none is guaranteed or inferred from another.
Retired URLs remain in a separate Search Console and URL Inspection monitor so
their residual impressions can be observed without treating them as active
landing pages or allowing them to influence publication readiness.

For unattended schema-v2 research, only an exact normalized
`top_rising_terms` match can clear the Trends gate. `top_terms` is discovery
context only, and legacy schema-v1 UI observations are retained solely for
historical/manual compatibility. Trends never substitutes for GSC, landing UV,
attribution, independent breakout evidence, IP safety, content distinctness,
or editorial and visual approval.

Semrush is replaced by the free Codex research path. Landing UV now prefers the
first-party beacon and Upstash aggregates: pageviews are exact daily counters,
while UV is a page-scoped Redis HyperLogLog estimate with approximately 0.81%
standard error. `FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT` is the immutable
coverage watermark. The single `CRON_SECRET`-protected rollover job in
`vercel.json` runs daily at `0 16 * * *` UTC (Shanghai 00:00); one call closes the previous Shanghai
day and opens the current one in Upstash, allowing Vercel's within-hour schedule
drift. A first-party period is observed only after the watermark and when every
included day has both proofs; otherwise it stays `unavailable`, never synthetic
zero. This job does not run the content pipeline, which remains on the local
Codex schedule. When
configured, the Vercel Web Analytics API is a full-requested-period fallback;
the collector chooses one provider and never adds or splices the two sources.
The landing endpoint's Redis fixed-window guard protects metric writes, not the
platform cost boundary; Vercel WAF/DDoS controls remain responsible for
platform-level abuse protection. Google Search Console remains free but
requires a verified property and service-account authorization before daily
query/page metrics can be read.

Search Console, first-party landing analytics, the optional Vercel fallback,
and product-scoped Upstash attribution are explicit data connections. A
Playworlds conversion callback has not been implemented, so conversion
readiness deliberately remains fail-closed. The old NovelAI callback is a
historical compatibility path only. Missing connections stay `unavailable`;
they never become synthetic zeroes. Automated collection uses a dedicated
bearer token; it does not reuse the interactive workbench password.

Copy `.env.example` to `.env.local` and configure only the integrations you have. Never commit `.env.local`.

### Free research mode variables

- `NEXT_PUBLIC_SITE_URL`
- `PLAYWORLDS_DESTINATION_URL` (optional; must remain the official Steam listing)
- `CODEX_RESEARCH_MODE=true`

### Private data and provider variables

- `WORKBENCH_PASSWORD`
- `SEO_AUTOMATION_TOKEN`
- `ATTRIBUTION_SECRET`
- `CRON_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT`
- `VERCEL_ANALYTICS_TOKEN`
- `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL`
- `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY`
- `GOOGLE_SEARCH_CONSOLE_SITE_URL`
- `GOOGLE_TRENDS_BIGQUERY_PROJECT_ID`
- `GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL`
- `GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY`
- `GITHUB_REPORTS_TOKEN`
- `GITHUB_REPORTS_REPO`

The Search Console service account must be added as a user on the Search
Console property. The Google Trends service account needs permission to run
BigQuery jobs (`roles/bigquery.jobUser`) in a project with the BigQuery API
enabled; the public Trends tables remain read-only and need no write grant.
Google Cloud's BigQuery free query allowance applies, but query usage still
belongs to that project. Configure a downloaded service-account JSON locally
with `npm run trends:configure -- /path/to/service-account.json`. It validates
the account and atomically updates only `GOOGLE_TRENDS_BIGQUERY_*` in this
worktree's ignored `.env.local`, preserves other variables, never prints the
private key, and refuses non-empty existing Trends values unless `--force` is
explicitly supplied. Delete the downloaded JSON from its original location
after securely backing it up according to your credential policy.
`npm run trends:check` checks the three independent
environment variables without making a network request and exits with status
2 when configuration is incomplete. `trends:collect` defaults to JSON on
stdout, accepts repeated `--candidate` values, and can atomically enrich a raw
research file with `--research`; it refuses to overwrite an existing
`trendCollection` or `trendSignals` section. An unavailable research-mode run
prints diagnostics, exits 2, and leaves the file untouched for a same-day
retry. Persisted collection schema 2 is compact (result counts/digests, exact
matches, and bounded deterministic D&D leads) and is signed with RSA-SHA256 by
the same server-only service-account key. Build, coordination, and publication
verify the configured client email and derived public-key fingerprint; the
private key is never written to an artifact. `--as-of YYYY-MM-DD` selects the
production date and queries the preceding `refresh_date`; in `--research`
mode it must match the research document date. The
limited-access official Google Trends API Alpha is a later upgrade path, not a
dependency of this BigQuery collector. The GitHub token should be fine-grained
and limited to Contents access on this repository. Generate
`SEO_AUTOMATION_TOKEN` from at least 32 random
bytes and configure the same value in Vercel and the trusted automation
environment; `WORKBENCH_PASSWORD` is optional and only for
interactive human access. Run `npm run growth:check` after changing any analytics
or callback credential.

## Deployment

Deploy this repository as a Next.js project on Vercel.

Canonical public guide URL:

```text
https://www.playworlds.ai/guides
```

`data/config/site.json` separates the canonical origin, `/guides` public base
path, and the child project's root-level private service origin. Public
canonical, sitemap, CTA, landing-beacon, Search Console, and Analytics URLs use
`https://www.playworlds.ai/guides`; protected `/api`, `/workbench`, and cron
routes remain on the SEO child service. Next static chunks and public guide
assets use the separate, collision-resistant `/playworlds-guides-assets`
namespace. Do not merge that namespace with `/guides`.

The Playworlds default project still must join the same Vercel Microfrontends
group as the `seo` child. Its repository owns `microfrontends.json`; after the
actual main Vercel project name is confirmed, the minimum production routing is:

```json
{
  "$schema": "https://openapi.vercel.sh/microfrontends.json",
  "applications": {
    "<PLAYWORLDS_MAIN_VERCEL_PROJECT_NAME>": {},
    "seo": {
      "packageName": "novelai-story-seo",
      "assetPrefix": "playworlds-guides-assets",
      "routing": [
        {
          "group": "playworlds-guides",
          "paths": [
            "/guides/:path*",
            "/playworlds-guides-assets/:path*"
          ]
        }
      ]
    }
  }
}
```

The checked-in child contract is
`data/config/vercel-microfrontends-child.json`. Keep its `applicationKey`
(`seo`), `packageName` (`novelai-story-seo`), asset prefix, and route list
identical to the corresponding child entry in the main repository. It is a
child fragment and deliberately is not named `microfrontends.json`: only the
default/main application owns that deployable routing file.

The default application is the one without `routing`. Both repositories must
install `@vercel/microfrontends` and wrap their Next configuration with
`withMicrofrontends`; this child is already wired, while the still-unknown main
repository remains an external prerequisite. The Playworlds main repository
also owns its root `robots.txt`, which must allow `/guides/`,
disallow `/guides/api/`, `/guides/go/`, and `/guides/workbench/`, and declare
`Sitemap: https://www.playworlds.ai/guides/sitemap.xml`. This repository cannot
prove or replace those main-project changes.

Vercel Web Analytics normally appears under the default/main application unless
the Microfrontends group explicitly routes observability to the child. Set
`VERCEL_ANALYTICS_PROJECT_ID` and `VERCEL_ANALYTICS_TEAM_ID` to the project that
actually owns that observability stream (main by default, SEO child only after
an explicit routing change), then verify a real `/guides/{slug}` visit is
queryable before treating landing UV as available.
