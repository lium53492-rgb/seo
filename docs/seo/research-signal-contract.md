# Research signal contract

This contract makes candidate selection auditable and resistant to score inflation. It applies to every new `policyVersion: 4` research input.

## Evidence boundary

Each evidence item needs a unique lowercase-hyphenated `id`, an accessible HTTP(S) URL, title, source, collection timestamp, and the exact candidate keywords it supports. The full research set needs at least five links from three independent registrable domains.

Each candidate needs at least two `decisionEvidence.evidenceRefs` from two independent domains. A reference is valid only when the corresponding evidence item lists the candidate keyword in `supports`. Product claims use approved `productFactIds`; external search evidence does not replace the product fact catalog.

## Candidate decision evidence

```json
{
  "decisionEvidence": {
    "schemaVersion": 1,
    "evidenceRefs": ["result-one", "result-two"],
    "searcherJob": "Continue an adult tabletop adventure with a persistent AI Game Master and choose voice or text play.",
    "productFactIds": [
      "playworlds-current-product",
      "dnd-content-direction",
      "dnd-primary-audience",
      "playworlds-voice-text-single-player-rpg",
      "playworlds-ai-game-master",
      "playworlds-persistent-campaigns"
    ],
    "productSignals": [
      "playworlds_current_product",
      "dnd_content",
      "adult_tabletop_audience",
      "playworlds_voice_text_rpg",
      "playworlds_ai_game_master",
      "playworlds_persistent_campaigns"
    ],
    "trialSignals": [
      "solution_aware",
      "immediate_use",
      "experience_seeking"
    ],
    "revenueSignals": [
      "commercial_comparison",
      "alternative_seeking"
    ],
    "specificitySignals": [
      "defined_task",
      "defined_format",
      "defined_audience"
    ],
    "ipClass": "original_generic",
    "cannibalizationClass": "new_intent",
    "nearestExistingSlug": null,
    "rationale": {
      "demand": "Explain the public demand observations behind the proxy.",
      "difficulty": "Explain the visible competition observations behind the proxy.",
      "productFit": "Explain why the selected approved facts answer the query.",
      "trialIntent": "Explain the evidence for trying an experience now.",
      "revenueIntent": "Explain the evidence for commercial or payment proximity.",
      "intentSpecificity": "Explain the defined task, format, audience, and modifier.",
      "originality": "Explain why this intent adds a distinct answer.",
      "ipRisk": "Explain why the query is generic or identify the IP conflict.",
      "cannibalizationRisk": "Compare the job with the nearest published page."
    }
  }
}
```

Each rationale must contain at least 30 characters. A rationale makes a signal reviewable; it does not make unsupported evidence true. The editor still rejects weak, circular, inaccessible, or irrelevant support.

## Deterministic scores

The weights live in `data/config/seo-policy.json`, and `scripts/lib/seo-policy.mjs` is the only scoring implementation.

- Product fit: Playworlds voice/text single-player RPG 30, AI Game Master 30,
  in-world companion 20, persistent campaigns 25, and RPG state 20; totals are
  capped at 100. `playworlds_current_product`, `dnd_content`, and
  `adult_tabletop_audience` are required zero-weight qualifiers for every new
  candidate. Legacy `voice_roleplay`, `story_premise`, `role_selection`, and
  `interactive_fiction` signals remain readable at weight 0 for historical
  artifacts only. A new candidate must name a concrete adult tabletop player
  or Game Master job and reach the 80-point product-fit gate from approved
  Playworlds capability facts. Product identity or audience direction alone
  cannot clear the gate or authorize protected settings, characters, logos,
  trademarks, rules text, official affiliation, licensing, or 5e
  compatibility.
- Trial intent: solution-aware 25, immediate-use 30, experience-seeking 30, action language 15.
- Revenue intent: commercial comparison 30, alternative seeking 25, purchase language 40, recurring use 15; totals are capped at 100.
- Intent specificity: defined task 30, defined format 25, defined audience 25, narrow modifier 20.
- IP risk: original generic 0, ambiguous reference 50, third-party IP 100.
- Cannibalization and originality: new intent 10/90, adjacent intent 45/70, same intent 90/30.

`new_intent` must not name an existing slug. `adjacent_intent` and `same_intent` must name a currently published nearest slug; the builder derives the existing URL from that page. A same-intent candidate consolidates instead of creating another route.

Raw input values for product fit, trial intent, revenue intent, specificity, originality, IP risk, and cannibalization risk are ignored. Only the derived values appear in a policy-version 4 report with `scoreBasis: "evidence_signals_v1"`.

## Proxy and observed data

`demandScore` and `difficulty` remain 0-100 public-web research proxies. They need evidence and rationale, but they never masquerade as Search Console or provider observations. Search Console impressions, clicks, CTR, and position stay in `performance`; landing UV and conversion outcomes stay in the growth portfolio.

## Google Trends provider contract

The automated provider is Google's official BigQuery public dataset for the
United States:

- `bigquery-public-data.google_trends.top_terms` contains up to the Top 25
  terms for each US DMA and is discovery context only;
- `bigquery-public-data.google_trends.top_rising_terms` contains up to the
  Rising 25 terms for each US DMA and is the only table that can satisfy the
  unattended schema-v2 Trends gate;
- collection runs daily with `npm run trends:check` followed by stdout
  discovery or
  `npm run trends:collect -- --research data/research/YYYY-MM-DD.json`, using
  `GOOGLE_TRENDS_BIGQUERY_PROJECT_ID`,
  `GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL`, and
  `GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY`.

A schema-v2 observation qualifies only when NFKC normalization, lowercasing,
trimming, and whitespace folding make the selected candidate keyword exactly
equal to an observed `top_rising_terms.term` value. Collection must run on the
same Shanghai production day; by default it queries the preceding day's
`refresh_date`. A substring, related phrase, semantic match,
`top_terms` row, public-web proxy, or model assertion cannot qualify. The
collector and publisher both enforce this boundary.

The embedded `trendCollection` uses compact, attested collection schema 2.
Instead of committing the full DMA result (which can exceed normal repository
file limits), it stores each table's row count and canonical result digest,
the exact candidate-match rows needed by the gate, and at most 50
deterministically selected D&D discovery leads. Each lead identifies its list,
rank, DMA count, source table, and applicable score/gain. A rising lead says
only that an exact future candidate could clear the Trends gate; intent,
product, IP, originality, growth, and review gates still apply.

The canonical snapshot digest binds those compact results, the two exact SQL
digests, and the signer identity. The collector signs that digest with
RSA-SHA256 using the already configured BigQuery service-account private key;
the artifact stores only the client email, derived public-key fingerprint,
algorithm, and signature. The builder and both publisher reads load the same
server-only environment, derive the public key, bind the configured client
email and fingerprint, and verify the signature. A locally recomputed SHA-256
digest is not publication authorization. Each BigQuery-derived `trendSignals`
entry repeats the verified snapshot digest. From the enforcement date, that
digest is also part of the editorial review digest, so evidence cannot be
replaced after approval without invalidating the review.

The public tables are DMA-granular. A row's `score` is retained only with its
DMA/week provenance; it must not be aggregated, averaged, or renamed as
nationwide `relativeInterest`. The dataset is not proof of arbitrary-keyword
volume. If the exact term is absent, record `not_observed` and do not publish.
That state means only that the term did not appear in the available Rising 25
rows; it does not mean zero searches.

`trends:check` validates the three independent environment variables without a
network request, prints JSON, and exits 2 when configuration is incomplete.
`trends:collect` defaults to stdout JSON containing `trendCollection` and
`trendSignals`; repeated `--candidate` flags select explicit terms.
Both GoogleSQL queries run in the `US` location with legacy SQL disabled, a
15-second timeout, a 100 MiB `maximumBytesBilled` ceiling, and a date-bound
parameter.
`--research` atomically adds those two top-level sections to the named raw
research file and refuses to overwrite either section. When collection is
`unavailable`, it exits 2 and prints the diagnostic JSON but does not write
either field, so the same day can retry after a transient outage. `--as-of YYYY-MM-DD`
overrides the production date, but in `--research` mode it must match the
document date and the collection day. The collector does not create a separate
`data/trends` snapshot; the digest-bound collection travels with the research
and report artifacts. Collection state is `observed` or
`unavailable`. Candidate state is `observed`, `not_observed`, or `unavailable`;
non-observed candidates retain `relativeInterest: null` and
`direction: unknown`, while an exact rising match is `observed`/`rising`.

Legacy schema-v1 observations from the Google Trends UI remain readable only
for historical or explicitly manual compatibility. They cannot clear the
unattended schema-v2 publication gate. Google's limited-access Trends API Alpha
is a future provider option; it is not the current automation dependency.

Trends is independent of the complete portfolio and quality contract. A
qualifying rising-term observation does not replace exact-page Search Console,
landing UV, attribution readiness, independent `breakout_page` evidence,
approved product facts, IP safety, content and presentation distinctness, or
review and visual-audit approval.

The publication decision therefore uses two layers:

1. Evidence-derived intent and safety gates decide whether a candidate is eligible.
2. Observed search, UV, outbound, trial, payment, and revenue data decide whether the portfolio should create, improve, consolidate, or observe.
