# SEO project operating instructions

Use this file as the repository entry point for every future SEO action. Read
the listed sources before researching, editing, publishing, reviewing, or
reporting. Do not rely on a single chat turn or a historical planning document.

## Source priority

Resolve conflicts in this order:

1. The current user request and any active automation instructions.
2. This file and the current working tree, including `git status` and current
   routes/components.
3. `data/config/seo-policy.json`, `data/config/product-facts.json`,
   `docs/seo/content-production-sop.md`, `docs/seo/free-research-robot.md`,
   and `data/seo-feedback/pending.md`.
4. Unconsumed files in `data/seo-feedback/inbox/`, then current
   `data/pages/`, research reports, and the active seven-day plan.
5. Older READMEs, workflows, briefs, tracker rows, and historic plans only for
   guidance that does not conflict with the sources above.

The older project documents describe an earlier story-specific landing-page
flow. Do not reintroduce its retired deep links, third-party story claims,
three-link rule, or unsupported feature descriptions without current product
evidence and user authorization.

## Mandatory preflight

Before a new page or update:

- Read every source-of-truth file in priority item 3.
- Read all unconsumed feedback entries and record their adoption/rejection
  before marking them consumed.
- Inspect current published pages, current-day growth/research/report/review/
  page/PDF paths, and `git status`; never overwrite, delete, stage, commit, or
  push unrelated user work.
- Treat `demandScore` and `difficulty` only as transparent 0-100 public-web
  research proxies. Keep observed Search Console data separate; when the
  logged-in browser has no visible rows, record `performance: []` and the
  reason rather than inventing data.
- Exclude unlicensed third-party IP. Use only approved `factIds` and never
  claim unapproved availability, price, privacy, latency, voice technology,
  real-time operation, groups, friends, multiplayer, or safety guarantees.
- Record the complete search-to-revenue funnel as observed or unavailable.
  The shared SEO-tool account is a research source, not a UV or revenue source.
- Aggregate Search Console and landing UV by source slug and reporting period.
  Use `seo_click_id` only for the qualified-outbound-to-revenue event chain.
- Run `npm.cmd run growth:collect` before candidate research. The resulting
  `data/growth/YYYY-MM-DD.json` must cover every published page over the same
  complete Shanghai-day window, even when an entry is explicitly unavailable.
- After the cold-start allowance in `data/config/seo-policy.json` is exhausted,
  do not publish another new page until at least one existing page has observed
  landing UV. Stop on orphan conversion callbacks instead of hiding a broken
  attribution join.

## Content and page requirements

- One distinct search intent and one H1 per page. Select a new answer, not a
  near-duplicate keyword variant.
- New candidates must use policy version 3 and pass product-fit, trial-intent,
  revenue-intent, intent-specificity, IP, and cannibalization hard gates.
- The English draft must be review-required, 600-1,000 words, have at least
  four sections and three FAQs, use approved facts only, contain a real CTA,
  and pass the builder's source, IP, duplicate, slug, and link gates.
- Keep the H1, main answer, sections, FAQ, CTA, and canonical metadata in the
  initial rendered HTML. Verify the current template rather than assuming an
  old workflow still matches it.
- The present information architecture is `SEO landing page -> attributed
  redirect -> NovelAI`: the bare homepage redirects to the approved NovelAI
  destination and SEO CTAs use `/go/novelai/{slug}` in a new tab. Confirm the live destination on each production
  run; do not restore the legacy story-share redirect path without approval.

## Daily production and release boundary

- Publish at most one new page per Shanghai day. A different keyword spelling
  is not a different intent, and an update is a separate evidence-led decision.
- If same-day growth, research, report, page, or PDF artifacts already exist from
  another task, stop and report the conflict instead of overwriting them.
- The research builder may only create a `ready_for_review` report. A separate
  identified editorial approval in `data/reviews/` is mandatory before the
  publisher writes a schema-version 2 page.
- Run the research builder, publisher, and `npm.cmd run verify` before release.
  Generate, render, and visually inspect the daily PDF when required.
- A daily SEO commit may contain only that day's growth snapshot, research,
  report, review, page, and requested PDF artifacts unless the user explicitly
  expands the scope. Do not push `main` when it would also publish unrelated
  local commits. Do not claim deployment until remote push, Vercel READY,
  rendered H1/canonical/CTA checks, and sitemap inclusion are all independently
  verified.

## Reporting and durable context

- State observed facts, proxy metrics, unavailable states, and deployment
  status precisely. Never infer production success from a local build.
- For an automation, read and update its memory file with a concise dated
  summary before returning.
- Preserve user feedback verbatim with dates, keep the feedback queue durable,
  and record the current action and any blocker in the relevant daily report.
