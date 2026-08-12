# SEO content production SOP

## Purpose

Use AI to accelerate evidence collection, structuring, drafting and checks. Keep editorial judgment, product truth, originality and publication decisions in a separate, identified review step. The reviewer may be human or an explicitly identified Codex editor when the user has delegated that authority; never label an AI review as human. This SOP supplements `free-research-robot.md`; when the two conflict, follow the stricter rule.

## 1. Start with an intent and knowledge map

Before choosing a keyword, record:

- the searcher's job-to-be-done and the question they need answered;
- the parent topic and adjacent intents already covered by the site;
- the page's original contribution: a specific explanation, decision aid, scenario, or product-grounded answer that existing pages do not provide;
- the approved product facts and a real next step the reader can take.
- the funnel stage, trial intent, revenue intent, conversion hypothesis, and exact metric that would confirm the hypothesis.

Do not create near-duplicate keyword variants. A keyword is only a discovery handle; the publishable unit is a distinct, useful answer inside a coherent topic cluster.

## 2. Research with source provenance

- Capture public evidence URLs, publisher/domain, date when visible, and the exact demand signal each source supports.
- Give every evidence record a stable ID. For policy version 4, each candidate must reference at least two directly supporting records from two independent domains and explain every selected product, trial, revenue, specificity, IP, and cannibalization signal.
- Never copy model-supplied hard-gate scores into a report. The builder derives them from the versioned signal policy; demand and difficulty remain explicitly labelled research proxies with rationales.
- Prefer official pages, credible editorial sources, public communities, and observable first-party Search Console data. Keep Search Console metrics separate from proxy demand and difficulty scores.
- Treat trend or hot-topic signals as leads, not product facts. Run the official
  US Google Trends BigQuery collector daily after growth collection and before
  research. The public dataset exposes Top 25 and Rising 25 rows per DMA; it is
  not an arbitrary-keyword or national-volume endpoint. For the unattended
  schema-v2 gate, only an exact normalized match in `top_rising_terms` is an
  observed qualifying signal. `top_terms`, related terms, and DMA `score`
  values can enrich discovery but cannot be relabelled as nationwide
  `relativeInterest`. Missing credentials or query failure is `unavailable`;
  a successful query without the exact term is `not_observed`. Both mean no
  publication, not zero search volume. Legacy
  schema-v1 UI observations remain historical/manual compatibility only. From
  the configured enforcement date, a selected page also needs a page-specific
  independent `breakout_page` record with a numeric signal, unit, basis,
  detail, same-day timestamp, and exact keyword support.
- Persist only the compact schema-v2 Trends projection: signed per-table result
  counts/digests, exact candidate matches, and bounded deterministic D&D
  discovery leads. Verify its RSA-SHA256 service-account attestation before a
  report or page can use it. An unavailable research-mode attempt must leave
  the research file unchanged so a same-day retry remains possible.
- Monitor Google policy or ranking-system changes through official Google Search Status Dashboard and Search Central documentation. Do not treat screenshots or third-party summaries as authoritative policy.

## 3. Draft with AI, finish with editorial judgment

AI may prepare the source summary, outline, first draft, schema suggestions and quality checklist. A separate final editor must:

- choose the final intent and title;
- verify every product claim against the fact whitelist;
- add the page-specific reasoning and useful distinctions that make the answer non-generic;
- remove unsupported promises, third-party IP, copied phrasing, and internal-process language;
- approve the CTA and decide whether the page is ready to publish.
- create a durable approval artifact; an in-memory judgment or a self-reported draft check is not publication approval.
- verify the machine-produced novelty audit, content-layer mapping, signature
  module, presentation recipe, and explicit decoration policy. The required
  checks are not satisfied by saying that the page merely “looks different.”

### Conversion and page-quality baseline

Every published SEO page must make its search intent understandable in the first screen, show a concrete path into the approved product experience, and use a CTA whose destination has been verified during that run. Do not compensate for missing product proof with generic AI prose, invented social proof, or decorative claims.

For new D&D-first pages, use this structure: a table-ready direct answer; the
session failure mode; one concrete player or Game Master framework; an original
mature worked example; meaningful variation; the product and IP boundary; and
a page-specific attributed next step. The machine contract requires the core
section roles `direct_answer`, `failure_analysis`, `framework`,
`worked_example`, and `next_step`. Do not force a related link when the only
available target is retired or irrelevant. Open external product destinations
in a new tab with `noopener noreferrer`.

User feedback and workbench content guidance are editorial inputs for the next daily run. Preserve each verbatim with a date, then translate it into an explicit brief requirement rather than silently changing copy. Guidance submitted from the workbench is marked `kind: "content_guidance"` and must be evaluated before keyword selection, not after the draft is written.
For feedback received through the workbench inbox, process only entries without
`consumedAt`, record the adoption or rejection in the daily report and automation
memory, then mark the entry with `consumedAt`. This keeps the feedback loop durable
without replaying a suggestion indefinitely.

## 4. Make important content crawlable and usable

The main answer, H1, supporting sections, FAQ, fact-based CTA, and canonical metadata must be present in the initial server-rendered HTML. Do not put the only substantive answer behind a lazy-loaded tab, click-only accordion, or client-only fetch.

Before publishing, inspect the rendered page and the initial HTML for the key content. Use progressive disclosure only for secondary detail. A visually attractive interaction does not replace crawlable content.

## 5. Learn from landing pages without copying them

Maintain a pattern library of publicly observed layouts and interactions: intent-to-hero alignment, proof placement, comparison structure, FAQs, and CTA sequencing. Record the source URL and what was learned. Reuse an idea or structural principle only after adapting it to our product, facts, and user intent; never copy protected copy, imagery, or proprietary IP.

Use `docs/seo/content-pattern-library.md` as the current reusable library. A new brief must name its searcher job, one-sentence answer, original contribution, page pattern, product bridge, contextual next step, and evidence boundary before drafting begins. Block a page that differs from an existing page only by a close keyword variation or cannot add an original checklist, decision tool, worked example, diagnostic, or approved product explanation.

The brief must also name the primary pain point, a coherent design direction,
one useful server-rendered signature module, and an ordered content-layer plan.
Rotate the design language with the intent: for example, a campaign war room,
gothic illuminated folio, sword-and-sorcery pulp spread, dark tavern noir,
archival campaign binder, and cosmic-horror field notes solve different reading
jobs. Do not
repeat the same visual language and pain point on consecutive pages merely by
changing a keyword or palette. The signature module must make the answer more
useful and remain accessible in the initial HTML; it is not permission for
client-only content or unsupported product claims.

Follow `docs/seo/content-architecture.md` for every new draft. Use
content-strategy schema 2 and draft schema 2; map every section and FAQ to its
planned role, place one original signature module in the ordered content flow,
and document intent/answer/structure/FAQ/visual differences from the nearest
published pages. Select a registered presentation recipe only after the answer
shape is fixed. A page pattern is not a presentation recipe.
Record a stable `painPointId`, use at least three section roles and two FAQ
jobs, and give structured formats explicit list markers plus at least two
semantic blocks. Only paragraphs, marked lists, and paired `**strong**` spans
are supported; raw HTML, headings, links, code, italics, and unmatched markers
must fail before review. The
published schema-3 payload must retain a recomputable served-content digest.

The primary CTA must name the page-specific outcome, pass its own similarity
gate, and avoid generic `Learn more`, `Get started`, `Explore`, or `Try` copy.
Pain points rotate across seven recent pages; presentation systems and reusable
recipes rotate across six. Policy-retired recipes and palettes are forbidden
without relying on publication history.

The unattended path uses original tabletop-fantasy material only. SRD-derived
copy is blocked until the artifact schemas can bind an exact SRD version,
license URL, and required Creative Commons attribution; a free-form note or an
input-supplied `ipClass` cannot substitute for that contract. From 2026-08-11,
the schema-2 draft carries an exact digest-bound original-only `ipBoundary`;
the builder, guarded publisher, and schema-3 page store also scan the SEO
keyword and visible copy for configured third-party references. Visible copy
is independently rejected for configured child-directed framing even when the
tone label says `mature`. Review must pass separate
`adult-tabletop-audience` and `original-ip-boundary` checks.

For reports on or after the configured visual-audit date, `rendered-preview`
requires the production renderer at 1440x1000 and 390x844. Store screenshot
paths and SHA-256 digests with measured H1 lines/viewport ratios, first-screen
CTA, horizontal overflow, raw-Markdown visibility, signature visibility, and
the longest uniform numbered run. Publisher validation must verify the files
before entering and again inside the guarded write.

When a draft includes a contextual internal link, the published template must render it as a standard crawlable `<a href="...">` with a descriptive anchor in the initial HTML. Storing `internalLinks` in a JSON artifact without rendering them does not satisfy this rule.

## 6. Measurement and iteration

- Publish no more than one new page per Shanghai day.
- Track publication date, evidence count, intent/cluster, approved fact IDs, rendering checks, page-level Search Console metrics, and 28-day outcome.
- Treat organic clicks as search-result clicks, not unique visitors. Do not promise a fixed traffic outcome.
- Aggregate Search Console clicks and landing UV by source page and reporting period. Join qualified outbounds, trials, signups, payments, and revenue with `seo_click_id`; do not use the shared keyword-research account as an analytics source.
- Before scoring the next page, run `npm run growth:check` and then
  `npm run growth:collect`, followed by `npm run trends:check` and
  `npm run trends:collect -- --research data/research/YYYY-MM-DD.json`.
  Use stdout mode with repeatable `--candidate` during discovery. Trends
  discovery/enrichment must finish before the research builder; review and
  publication come afterward. The growth
  collector records every published page in one
  atomic 28-complete-Shanghai-day portfolio ending after the configured
  three-day finalized-data lag. Include it through `portfolioSnapshot` or
  `portfolioFunnels`; do not hand-pick only the best-performing page. A failed
  credential or endpoint remains an unavailable page entry. Commercial
  outcomes remain in the private API/in-memory response; the committable
  snapshot keeps only exact-page GSC, sanitized URL Inspection, aggregate UV,
  aggregate qualified outbound, and boolean readiness/blocking state.
- Keep formally retired URLs in the snapshot's separate `retiredUrls` monitor.
  Persist only exact-page Search Console and sanitized URL Inspection evidence
  for them; never count them in active-page totals, attribution readiness, or
  the next-page decision.
- Convert that portfolio into a durable `portfolioDecision`: `create_page`, `improve_page`, `consolidate`, or `observe`. Record an evidence-led rationale, cited published slugs, and a target slug when applicable. A draft is legal only for the matching create or improve action.
- Page count and non-zero performance remain prioritization signals rather than traffic quotas. Observed zero is valid. For unattended `create_page` production, however, the complete current portfolio must have observed exact-page Search Console and landing UV states for every published page and a ready attribution join; unavailable measurement blocks publication. An update additionally needs an observed Search Console row for its exact target URL.
- Consolidation is not permission to redirect. The builder requires distinct
  source and target slugs, at least one query observed for both exact pages,
  at least 20 exact-page impressions per page over the same finalized period,
  and a target URL Inspection result showing successful fetch, indexing
  allowed, and same-site self-referencing user and Google canonicals. Otherwise
  the correct action is `observe`.
- Every funnel field must be observed with a named source or unavailable with a reason. Never infer zero from a missing export, empty UI, or disconnected callback.
- A Google Trends row does not repair or replace unavailable Search Console,
  landing UV, attribution, IP/product facts, independent breakout evidence,
  originality, content quality, or visual-review evidence. All gates remain
  independent.
- Use report history to identify pages that need improved titles, clearer intent, stronger internal connections, or a product-fact correction. Only set `publicationMode: "update"` when actual Search Console evidence supports an update.

## 7. Workbench acceptance criteria

The workbench must show the evidence and freshness behind every trend or hot
signal, identify whether it came from `top_terms` or `top_rising_terms`, keep
per-DMA values distinct from national measures, distinguish proxy scores from
observed performance, expose a durable feedback queue, and provide a manual
free research/report path that does not call a paid AI Gateway. Every visible
action must have an observable result or a clear unavailable-state explanation.
