# NovelAI SEO Growth Workbench

A Next.js SEO landing site plus a revenue-first research-to-action workbench for
NovelAI voice roleplay and interactive stories. Each published page owns one
independent search intent and sends qualified readers through an attributed
NovelAI redirect.

## Commands

```bash
npm install
npm run dev
npm run growth:check
npm run growth:collect
npm run verify
```

## Workbench

Open `/workbench` to inspect the latest persisted production report. With no
external credentials or report configured, the UI shows a disconnected state
with zero metrics; it never substitutes demo values.

Open `/workbench/guide` for the Chinese operating manual, the daily review
checklist, the data-to-design decision rules, and direct authorization links.

The default zero-extra-data-cost pipeline is:

```text
Codex public-web research
-> source URLs + transparent demand/competition proxy scores
-> opportunity scoring
-> recommended action
-> fact-constrained page brief
-> GitHub JSON report
-> Vercel workbench refresh
```

The Codex desktop automation runs every day at 09:15 Asia/Shanghai. It first
collects one all-page growth snapshot, then researches the public web, writes a
review-required English draft, and builds a durable report. A separate approval
artifact is mandatory before publication. The builder blocks unsupported
product claims, weak trial/revenue intent, duplicate intent, unapproved facts,
and blind page expansion without observed UV. The workbench labels research
values as proxy scores; they are not monthly search volume, CPC, Google data, or
Semrush KD. See
`docs/seo/free-research-robot.md` for the evidence and scoring protocol.

Semrush is replaced by the free Codex research path. Vercel Web Analytics pageview
instrumentation is installed; enable the project-level switch in Vercel to begin
collection. Google Search Console remains free but requires a verified property
and service-account authorization before daily query/page metrics can be read.

Search Console, Vercel Analytics, Upstash, and the NovelAI conversion callback
are explicit data connections. Missing connections stay `unavailable`; they
never become synthetic zeroes. Without a workbench password, private page-level
funnel data and run endpoints stay protected.

Copy `.env.example` to `.env.local` and configure only the integrations you have. Never commit `.env.local`.

### Free research mode variables

- `NEXT_PUBLIC_SITE_URL`
- `CODEX_RESEARCH_MODE=true`

### Private data and provider variables

- `WORKBENCH_PASSWORD`
- `ATTRIBUTION_SECRET`
- `CRON_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `VERCEL_ANALYTICS_TOKEN`
- `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL`
- `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY`
- `GOOGLE_SEARCH_CONSOLE_SITE_URL`
- `GITHUB_REPORTS_TOKEN`
- `GITHUB_REPORTS_REPO`

The Google service account must be added as a user on the Search Console
property. The GitHub token should be fine-grained and limited to Contents access
on this repository. Run `npm run growth:check` after changing any analytics or
callback credential.

## Deployment

Deploy this repository as a Next.js project on Vercel.

Current production domain:

```text
https://seo-pi-fawn.vercel.app
```

If a custom domain is added later, set `NEXT_PUBLIC_SITE_URL` to that domain in Vercel and update the fallback URLs in the app metadata files.
