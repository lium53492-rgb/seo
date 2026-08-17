# D&D-first SEO production system

This directory supports the repository's current overseas SEO workflow. The
authoritative rules remain `AGENTS.md`, `data/config/seo-policy.json`,
`data/config/product-facts.json`, and the production SOP; old plans and briefs
under this directory are historical evidence, not current publishing orders.

## Current goal

Publish at most one evidence-led page per Shanghai day for adult D&D players
or Game Masters. Each page must solve one concrete tabletop job and provide a
different answer structure, worked example, visual world, pain point, and CTA.
Pages are not released merely to satisfy a daily count.

Current editorial lanes include:

- Game Master preparation and campaign continuity;
- encounter, NPC, and improvisation repair;
- player-character hooks, agency, and party-tone alignment;
- adult tool and workflow decisions with a real trial or purchase job.

## Product and IP boundary

The D&D direction and adult tabletop audience are approved facts, but they do
not prove an official license or a product capability. Every page must cite
separate approved capability facts and pass the configured product-fit gate.
Automated production uses original tabletop-fantasy material until a
machine-validated SRD version, license basis, and attribution contract exists.

## Release contract

- Collect the full active-page growth portfolio before research.
- Use official Google Trends evidence for the selected new-page candidate.
- Keep Search Console observations separate from demand proxies.
- Require a distinct intent, adult D&D/tabletop audience term, concrete table
  job, approved pain point, and all configured content layers.
- Require an independent editorial review and visual-audit receipt.
- Publish current-schema pages through `/guides/go/playworlds/{slug}` attribution;
  retain `/go/novelai/{slug}` only for historical compatibility and never restore legacy
  `/go/story/` redirects.
- Run `npm.cmd run verify` before any release.
- Do not claim a page is live until push, deployment readiness, rendered-page,
  canonical, CTA, sitemap, and production checks all succeed.

See `docs/seo/free-research-robot.md`, `docs/seo/content-production-sop.md`, and
`docs/seo/dnd-content-boundary.md` for the active procedure.
