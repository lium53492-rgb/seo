# SEO content production SOP

## Purpose

Use AI to accelerate evidence collection, structuring, drafting and checks. Keep editorial judgment, product truth, originality and publication decisions human-controlled. This SOP supplements `free-research-robot.md`; when the two conflict, follow the stricter rule.

## 1. Start with an intent and knowledge map

Before choosing a keyword, record:

- the searcher's job-to-be-done and the question they need answered;
- the parent topic and adjacent intents already covered by the site;
- the page's original contribution: a specific explanation, decision aid, scenario, or product-grounded answer that existing pages do not provide;
- the approved product facts and a real next step the reader can take.

Do not create near-duplicate keyword variants. A keyword is only a discovery handle; the publishable unit is a distinct, useful answer inside a coherent topic cluster.

## 2. Research with source provenance

- Capture public evidence URLs, publisher/domain, date when visible, and the exact demand signal each source supports.
- Prefer official pages, credible editorial sources, public communities, and observable first-party Search Console data. Keep Search Console metrics separate from proxy demand and difficulty scores.
- Treat trend or hot-topic signals as leads, not facts. They need a source, freshness date, product-fit check, and intellectual-property risk check before they can influence a brief.
- Monitor Google policy or ranking-system changes through official Google Search Status Dashboard and Search Central documentation. Do not treat screenshots or third-party summaries as authoritative policy.

## 3. Draft with AI, finish with editorial judgment

AI may prepare the source summary, outline, first draft, schema suggestions and quality checklist. The final editor must:

- choose the final intent and title;
- verify every product claim against the fact whitelist;
- add the page-specific reasoning and useful distinctions that make the answer non-generic;
- remove unsupported promises, third-party IP, copied phrasing, and internal-process language;
- approve the CTA and decide whether the page is ready to publish.

### Conversion and page-quality baseline

Every published SEO page must make its search intent understandable in the first screen, show a concrete path into the approved product experience, and use a CTA whose destination has been verified during that run. Do not compensate for missing product proof with generic AI prose, invented social proof, or decorative claims.

For story-roleplay pages, use this structure: a query-specific promise; a concise three-step path from story premise to role selection to entering the scene; at least one clear primary CTA with an honest destination label; and a related first-party internal link. Open external product destinations in a new tab with `noopener noreferrer`, and maintain a safe fallback if a deep link has become unavailable.

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

## 6. Measurement and iteration

- Publish no more than one new page daily unless a separate exception is explicitly approved.
- Track publication date, evidence count, intent/cluster, approved fact IDs, rendering checks, page-level Search Console metrics, and 28-day outcome.
- Treat organic clicks as search-result clicks, not unique visitors. Do not promise a fixed traffic outcome.
- Use report history to identify pages that need improved titles, clearer intent, stronger internal connections, or a product-fact correction. Only set `publicationMode: "update"` when actual Search Console evidence supports an update.

## 7. Workbench acceptance criteria

The workbench must show the evidence and freshness behind every trend or hot signal, distinguish proxy scores from observed performance, expose a durable feedback queue, and provide a manual free research/report path that does not call a paid AI Gateway. Every visible action must have an observable result or a clear unavailable-state explanation.
