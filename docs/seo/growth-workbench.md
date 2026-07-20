# SEO Growth Workbench MVP

## Goal

Turn daily SEO research into one prioritized, auditable action rather than mechanically publishing one page every day.

## Implemented in this MVP

1. Semrush related-keyword collection from configurable seeds.
2. Google Search Console query-by-page performance collection.
3. Opportunity scoring across demand, difficulty, trend, product fit, originality, conversion intent, IP risk, and cannibalization risk.
4. Automatic choice between create, improve, consolidate, and observe.
5. A structured page brief with evidence and quality gates.
6. A protected `/workbench` dashboard.
7. A protected manual-run endpoint.
8. A daily Vercel Cron endpoint.
9. Optional JSON report persistence through the GitHub Contents API.
10. Explicit demo, partial, and live data modes.

## Daily Run

```text
01:15 UTC / 09:15 Asia/Shanghai
-> Vercel calls /api/cron/daily-seo with CRON_SECRET
-> collect Semrush candidates
-> collect Search Console performance
-> normalize and score
-> select the highest-value action
-> build the page brief
-> persist data/reports/YYYY-MM-DD.json when GitHub is connected
-> write a structured completion event to Vercel logs
```

## Scoring Principle

The score intentionally does not optimize only for low keyword difficulty.

Positive inputs:

- product fit
- originality potential
- conversion intent
- search demand
- ranking feasibility
- recent growth

Penalties:

- unlicensed IP risk
- keyword cannibalization risk

The exact weight is centralized in `lib/seo/scoring.ts` and can be calibrated after 30–60 days of real conversion data.

## Safety and Quality Gates

- No automatic publication when real product evidence is missing.
- Demo figures are visibly labeled and cannot be confused with connected data.
- Without `WORKBENCH_PASSWORD`, the demo workbench is public and read-only while its mutation API remains disabled.
- After live data is connected, set `WORKBENCH_PASSWORD` to protect the page and its action API together.
- Manual runs recheck authorization at the API layer.
- Cron requests require `Authorization: Bearer $CRON_SECRET`.
- External credentials are server-only variables.
- A page brief requires real stories, roles, voice/product facts, and original assets before publication.

## Next Implementation Slice

1. Replace deterministic brief copy with an LLM content adapter.
2. Store reports and run history in Neon instead of Git commits when the volume grows.
3. Generate preview routes from structured content records.
4. Add browser QA, broken-link checks, metadata checks, and screenshot approval.
5. Create a GitHub PR automatically after the quality gate passes.
6. Add product events: CTA click, role selected, voice session started, registration, D1 retention, and payment.
7. Train the opportunity weights against conversions rather than traffic alone.
