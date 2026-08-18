# Page launch dossier template

Use this checklist before drafting a new page or making a schema-version 2
update. The durable dossier belongs at `data/page-dossiers/{slug}.json` and
starts with `publicationEligible: false` and `reviewBinding: null`.

A dossier records evidence, decisions, and unresolved gates. It is not a
publication approval and cannot override policy, product truth, rights,
measurement, editorial review, visual review, or the guarded publisher.

## Identity and binding

- What is the proposed slug, public root path, and protected preview route?
- Is this a new page or an evidence-led update to an existing page?
- Which current policy version, content-strategy version, draft version, and
  published-page version apply? Current production uses policy 4, content
  strategy schema 2, draft schema 2, and published page schema 3.
- Which same-day report ID and draft digest will this dossier bind to?
- Is `reviewBinding` still `null`? It must remain null until the separate
  review artifact is approved for that exact report, slug, and digest.

## Search intent and keyword source

- What single job is the searcher trying to complete?
- What is the primary keyword, and which supporting terms clarify rather than
  duplicate the intent?
- Which current public evidence records support this exact candidate, with at
  least two directly supporting records from two independent domains?
- Which values are transparent demand/difficulty proxies, and which values are
  observed first-party Search Console measurements? Keep them separate.
- Does the candidate serve an adult D&D/tabletop player or Game Master and a
  concrete table job without implying official affiliation or compatibility?
- Which nearby intent is deliberately not answered, and what makes this answer
  materially different from the current page corpus?

## Google Trends and breakout evidence

- What same-day, attested Google Trends collection covers this exact keyword?
- Is there an exact normalized US `top_rising_terms` match? A top-terms row,
  related term, partial match, or DMA score does not clear the current gate.
- If the exact phrase was not observed, does the dossier say `not_observed`
  rather than treating it as zero search volume?
- Which independent same-day `breakout_page` record supports the selected
  candidate, including numeric value, unit, basis, detail, timestamp, and URL?

## Competitor and source learning

- Which accessible pages were inspected, on which date, and what specific
  search, passage, structure, or conversion pattern was learned from each?
- Which sources are official product evidence and which are merely design or
  workflow inspiration?
- Does every traffic, ranking, engagement, or conversion statement stay
  explicitly unavailable unless it was actually observed?
- How will the page adapt useful principles without copying protected wording,
  imagery, characters, settings, symbols, or proprietary interaction design?

## Section map and passage architecture

- What is the one-sentence answer, original contribution, stable pain-point
  ID, reader state before, and reader outcome?
- Does the pain point belong to the current D&D-first allowlist?
- Which registered page pattern, archetype, opening move, signature module,
  and presentation recipe fit the answer shape?
- Map every section in order to a reader question, required role, supported
  format, and unique takeaway. Current D&D-first pages need
  `direct_answer`, `failure_analysis`, `framework`, `worked_example`, and
  `next_step`.
- Map every FAQ to a distinct reader obstacle, FAQ job, and answer boundary.
- Can each H2 passage and FAQ answer make sense when retrieved in isolation?
- Is the useful answer present in initial server-rendered HTML rather than
  hidden behind a client-only interaction?

## Product truth

- Which active fact IDs support each product-facing sentence?
- What current official first-party source was rechecked, and when?
- Which release status, platform, price, feature, or availability statements
  are time-sensitive and therefore must be rechecked on publication day?
- Which plausible claims are explicitly excluded because the fact catalog does
  not support them?
- Are original editorial examples clearly separated from confirmed Playworlds
  product content?

## IP, licensing, and audience boundary

- Is the page based only on original tabletop-fantasy material under the
  current machine contract?
- If D&D is named, is it limited to an adult audience/search reference with no
  affiliation, endorsement, licensing, rules, setting, or 5e compatibility
  claim?
- Are all characters, places, creatures, artifacts, symbols, and visuals
  original and checked for recognizable third-party references?
- If any SRD-derived material is proposed, where are the exact SRD version,
  license URL, required attribution, and copy boundary? Until the structured
  contract exists, do not use SRD-derived copy.
- Does the schema-2 draft carry the exact original-only `ipBoundary` contract,
  with separate visible-copy and child-directed framing checks?

## GEO and retrievable-answer plan

- Which geography and language does the research support? Current automated
  Trends collection uses US data and the production draft is English.
- Which complete, answer-first passage should be retrievable for the primary
  intent, and which passages answer the main supporting questions?
- Are headings, opening sentences, entities, limitations, and source context
  explicit enough to remain meaningful when retrieved independently?
- Are Article and FAQ structures factual, visible, and aligned with the same
  initial HTML rather than generated only for schema markup?

## CTA and conversion contract

- What page-specific outcome does the primary CTA promise?
- Does the public schema-3 renderer use
  `/go/playworlds/{source-slug}?location={location}` rather than a direct or
  retired product route?
- Is the approved external destination still the official Playworlds Steam
  listing, and was it rechecked on publication day?
- Does the protected preview disable the CTA? An unpublished source slug must
  continue returning 404 from the attributed route until a valid page exists
  in `data/pages`.
- Will the release verifier prove a non-writing HEAD request returns the
  expected attributed 307 only after publication?

## Measurement and revenue loop

- What complete finalized Shanghai-day reporting period is used?
- Does the growth snapshot cover every active published page over the same
  period, with exact-page GSC and one complete landing-UV provider state?
- Is the GSC property exactly `https://lorelens.playworlds.ai/`, and is access
  observed rather than inferred from configuration?
- Is the landing-UV coverage observed for the whole requested period?
- Is the attribution join ready, with no orphan conversion callbacks?
- Has a recent signed Playworlds callback handshake been observed in the
  Playworlds server environment? A legacy callback is not evidence.
- Are qualified outbounds, conversion outcomes, and revenue joined only by
  `seo_click_id`, while private outcomes remain outside committable artifacts?

## Editorial, visual, and schema-3 proof

- Has a separate identified editor approved the exact report, slug, and draft
  digest with all policy and architecture checks? A Codex editor must identify
  itself as `codex_editor`, never as human.
- Do the 1440x1000 and 390x844 visual-audit receipts bind real screenshot files
  and hashes to the same draft digest?
- Does the final schema-3 artifact contain an approved editorial review,
  `quality.passed: true`, a recomputed 600-1,000-word count, active fact IDs,
  the original-IP contract, and a recomputable `servedContentDigest`?
- Is the concept preview clearly described as a renderer fixture only? A
  schema-3-shaped in-memory preview with `quality.passed: false`, no editorial
  review, and no served-content digest is not a publishable page.

## Release gate decision

Record every gate independently as `passed`, `blocked`, or `unavailable`, with
evidence and a dated reason:

- canonical LoreLens production origin and matching GSC property;
- same-day growth portfolio and attribution readiness;
- signed Playworlds callback handshake;
- exact Google Trends Rising match and independent breakout evidence;
- distinct intent, policy-derived scores, adult tabletop audience, and current
  Playworlds product fit;
- product-fact and original-IP boundaries;
- content, novelty, CTA, and presentation contracts;
- approved review binding and visual audit;
- daily coordinator, one-page limit, publishing window, clean artifact set,
  guarded publisher, exact Git revision, Vercel readiness, live page checks,
  sitemap inclusion, and attributed redirect verification.

Set `publicationEligible: true` only when all required gates pass at the actual
publication stage. Keep it false when any gate is blocked or unavailable, even
if the domain, preview, or deployment is already working.
