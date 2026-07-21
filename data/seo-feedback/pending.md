# Pending SEO feedback

Last updated: 2026-07-21 (Asia/Shanghai)

## Operating constraints

- Publish at most one new English SEO page per day.
- Treat 20 organic visits per page as a 28-day performance target, not a guaranteed outcome. Use only observed Search Console data for evaluation.
- Do not create pages around unlicensed events, teams, players, celebrities, or other third-party intellectual property. Seasonal and topical demand may be researched only through original, generic intents.
- SEO-page CTAs should lead to the approved NovelAI destination once the production CTA deployment has completed.

## Production methodology adopted 2026-07-21

- Before each daily run, read `docs/seo/content-production-sop.md` together with the required research robot instructions.
- Choose a new search intent from a topic and knowledge map, not from a keyword list alone. The brief must state the page's original contribution and the adjacent intent it deliberately does not duplicate.
- Keep the H1, main answer, supporting sections, FAQ, CTA, and canonical metadata in initial server-rendered HTML. Do not make a lazy tab or client-only fetch the sole location of useful SEO content.
- Keep a source URL and freshness date for every trend or hot signal. Use official Google sources for Google-policy claims; third-party articles are workflow inspiration, not policy evidence.
- AI may collect, structure, draft, and check. The final release decision must verify product facts, originality, IP risk, page-specific usefulness, and user feedback.
- Learn landing-page patterns as reusable structure only; do not copy copywriting, imagery, or third-party intellectual property.

## User feedback awaiting intake

- The user plans to bring additional SEO-page research and feedback after studying external examples. Preserve this queue and add the feedback verbatim with its date when it arrives.
- The supplied 2026-07-21 SEO articles emphasize: tool-chain automation with human review, knowledge architecture over isolated keywords, crawlable primary content, landing-page pattern study, source-aware monitoring, and AI-plus-human editorial SOP. Apply the methodology above to the next daily brief and workbench repair.
- Workbench submissions are stored in `data/seo-feedback/inbox/YYYY-MM-DD.json`. Before production, process entries without `consumedAt`, record the adopted or rejected decision in the same-day report/memory, then set `consumedAt` with an ISO timestamp so feedback is not silently replayed forever.
