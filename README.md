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

The pipeline is split into:

```text
Semrush + Search Console
-> normalized keyword and page data
-> opportunity scoring
-> recommended action
-> fact-constrained AI page draft and quality gate
-> GitHub JSON report
```

Production runs are scheduled for 09:15 Asia/Shanghai (`01:15 UTC`) through
Vercel Cron. The cron route and workbench actions are protected independently
with `CRON_SECRET` and `WORKBENCH_PASSWORD`. Without a workbench password, the
disconnected dashboard remains public and read-only while the run API stays
disabled. Strict production runs fail when Semrush, Search Console, or AI
Gateway cannot be verified.

Copy `.env.example` to `.env.local` and configure only the integrations you have. Never commit `.env.local`.

### Minimum production variables

- `NEXT_PUBLIC_SITE_URL`
- `WORKBENCH_PASSWORD`
- `CRON_SECRET`

### Live data variables

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
