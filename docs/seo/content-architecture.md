# SEO content and presentation architecture

This contract prevents a new keyword from becoming an old page with changed
nouns. Reader intent, answer structure, copy, presentation, and release proof
are separate layers with independent rejection gates.

## The five layers

1. **Search decision** — content-strategy schema 2 records the exact searcher
   job, stable pain-point ID, state before the page, desired outcome, specific
   pain point, one-sentence answer, original contribution, product bridge,
   evidence boundary, and conversion hypothesis.
2. **Content architecture** — draft schema 2 selects an archetype and opening
   move, assigns a reader question/role/format/takeaway to every section,
   assigns an obstacle/job/boundary to every FAQ, and plans one useful
   signature module.
3. **Content payload** — every reader-visible statement comes from reviewed
   fields: H1, hero, short answer, thesis, section questions and bodies, FAQ
   copy, signature items, CTA, and page-specific interface labels. Templates
   do not invent editorial copy.
4. **Presentation** — a registered recipe supplies the visual world, true
   renderer, layout grammar, palette, type voice, motif, reuse policy, and
   explicit decoration policy. `pagePattern` never selects a skin.
5. **Release** — builder, editorial review, publisher, page store, SSR, and
   post-build verification consume the same contract. Review binds the draft
   plus content strategy; a separate served-content digest binds the fields
   actually delivered by a schema-3 page.

## Source files

- `data/config/content-architecture.json`: pain points, answer shapes, semantic
  section/FAQ jobs, depth rules, cooldowns, exact novelty thresholds, and
  review checks.
- `data/config/presentation-recipes.json`: seven implemented visual recipes,
  each with its own renderer ID, layout, palette, domain concepts, rejected
  defaults, and reuse policy. The policy retirement arrays currently remove
  the specimen catalog and playful story workshop from future production;
  implemented legacy code does not make a recipe eligible.
- `lib/seo/content-contract.mjs`: fail-closed policy validation and exact
  architecture-to-copy mapping.
- `lib/seo/served-content.mjs`: canonical rendered-copy inventory and runtime
  digest.
- `lib/seo/content-similarity.mjs`: field, text, structure, signature, pain
  point, and presentation novelty audit.
- `lib/seo/content-history.mjs`: durable recipe, structure, and signature usage
  events recovered from published reports, including later route updates.
- `app/[slug]/StructuredContentPage.tsx`: schema-3 semantic renderer registry.
  Schema 1/2 routes remain isolated in legacy families.

## Required new-draft contract

Each new draft is schema 2. Section and FAQ IDs map one-to-one and in order to
the architecture. Each section has a specific reader question and takeaway;
each FAQ has an obstacle and an explicit answer boundary. A signature module
has a page-unique ID, type, reader action, real placement, introduction, and at
least three useful items.

The content cannot concentrate 600 words in one generic section. Every
section, FAQ answer, and signature item has an independent minimum depth.
Steps, checklists, examples, and comparisons require at least two Markdown
blocks so runtime can emit real lists or separated comparison units. A page
needs at least three section roles and two FAQ jobs.

The architecture must explain concrete intent, answer, structure, FAQ, and
visual differences from the nearest two published pages when two exist.
Generic statements such as “different style” fail validation.

## Novelty gates

Builder and publisher run the same audit against the complete published
corpus. Independent gates cover:

- title, meta description, H1, hero, and whole visible text;
- the closest section heading/body and FAQ question/answer;
- page-specific surface labels and CTA copy;
- five-word shingles and repeated long sentences;
- internal section and FAQ repetition;
- pain point, archetype, opening move, full structure fingerprint, FAQ-job
  sequence, signature ID/type, recipe, visual system, layout, and palette;
- single-use and multi-page cooldown windows ordered by the latest valid
  publication, report, draft, or update timestamp so a newly changed old route
  counts as recent. Published report history keeps a retired single-use recipe
  or signature ID unavailable even after its original page changes design.

Approved product-fact sentences can repeat exactly without disabling the
other gates. Common product-domain terms are removed only from whole-page
ranking; short fields retain strict comparison, so duplicated headings cannot
hide inside different long paragraphs. A realistic distinct-draft fixture
must continue to pass against the complete production corpus.

Missing or misspelled policy thresholds fail closed. The corpus digest covers
served content, structure, presentation metadata, and effective timestamps.
The publisher stores the publication-time novelty result, not a stale builder
snapshot.

## Presentation and decoration

The seven renderer IDs correspond one-to-one with implemented DOM/layout
grammars: rehearsal slate, nocturne decision grid, product field manual,
editorial argument, specimen catalog, orbital mission log, and playful story
workshop. This is more than a palette switch. Current D&D-first production may
use only recipes not listed as retired, and the selected visual world must
support the page's adult tabletop job rather than re-skinning a generic story
worksheet.

Signature types also change runtime semantics: comparison/diagnostic/
myth-fact modules use definition groups; inventory/checklist modules use
lists; worked-example/timeline/scenario modules use ordered sequences.

Every recipe declares `companion` and `gallery`. Gallery is currently forced
to `none` until a content-driven gallery schema and renderer exist. A story
companion appears only when an explicit recipe allows it. One legacy route is
preserved through an explicit slug policy; legacy families no longer add the
same pet or gallery to every page.

## Publication and compatibility

Schema 1/2 pages stay readable. Newly reviewed drafts are schema 2; newly
published pages use the schema declared by `seo-policy.json` (currently 3).
The page store recomputes the served-content digest, validates architecture
mapping and per-layer depth, and rejects post-release edits that retain an old
approval record.

From 2026-08-11, a schema-2 draft on the schema-3 publication path includes a
digest-bound original-only `ipBoundary`. The builder, guarded publisher reread,
and page store all validate the exact contract and scan visible content. The
schema-3 review contract also requires separate adult-tabletop-audience and
original-IP-boundary judgments so metadata alone cannot certify the prose.

Architecture work does not authorize overwriting same-day growth, research,
report, review, page, or PDF artifacts. Existing routes migrate only through
a legal evidence-led update with a new report, review, and release digest.
