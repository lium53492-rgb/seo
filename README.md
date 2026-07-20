# NovelAI SEO Growth Workbench

A Next.js SEO landing site plus a daily research-to-action workbench for NovelAI voice roleplay and interactive stories.

## First Page

- Keyword: `2000s marriage life simulator`
- Page: `/`
- Destination story: `https://www.novelai.ai/story/9b61e7e9-772c-44ad-b318-5f76db9c993a/episode/bd7eaf4e-a4d7-411f-a71b-f2fb4216b410?progression=guided&scenarioId=scenario-1&preventRepeatChoices=1`

## Commands

```bash
npm install
npm run dev
npm run build
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

The Codex desktop automation runs every day at 09:15 Asia/Shanghai. It researches
the public web, writes `data/research/YYYY-MM-DD.json`, builds
`data/reports/YYYY-MM-DD.json`, validates the project, and pushes only those two
daily files. The highest-scoring supported keyword also receives a human-review
English page draft. The builder blocks unsupported product claims and unapproved
fact IDs. The workbench labels research values as proxy scores; they are not
monthly search volume, CPC, Google data, or Semrush KD. See
`docs/seo/free-research-robot.md` for the evidence and scoring protocol.

Semrush is replaced by the free Codex research path. Vercel Web Analytics pageview
instrumentation is installed; enable the project-level switch in Vercel to begin
collection. Google Search Console remains free but requires a verified property
and service-account authorization before daily query/page metrics can be read.

Semrush, Search Console, AI Gateway, and the protected server-run workflow remain
optional upgrades. Without a workbench password, the public dashboard is
read-only while the run API stays disabled.

Copy `.env.example` to `.env.local` and configure only the integrations you have. Never commit `.env.local`.

### Free research mode variables

- `NEXT_PUBLIC_SITE_URL`
- `CODEX_RESEARCH_MODE=true`

### Optional provider-backed variables

- `WORKBENCH_PASSWORD`
- `CRON_SECRET`
- `SEMRUSH_API_KEY`
- `GSC_SITE_URL`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GITHUB_REPORTS_TOKEN`
- `GITHUB_REPORTS_REPO`

AI generation uses Vercel AI Gateway OIDC automatically in production. Set
`SEO_CONTENT_MODEL` to an available Gateway language model; a static provider
key is not required on Vercel.

The Google service account must be added as a user on the Search Console property. The GitHub token should be fine-grained and limited to Contents access on this repository.

## Deployment

Deploy this repository as a Next.js project on Vercel.

Current production domain:

```text
https://seo-pi-fawn.vercel.app
```

If a custom domain is added later, set `NEXT_PUBLIC_SITE_URL` to that domain in Vercel and update the fallback URLs in the app metadata files.
