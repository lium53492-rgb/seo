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
    "searcherJob": "Enter an original AI roleplay story now and compare whether the format is worth trying.",
    "productFactIds": [
      "voice-roleplay-format",
      "existing-story",
      "role-selection"
    ],
    "productSignals": [
      "voice_roleplay",
      "story_premise",
      "role_selection"
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

- Product fit: voice roleplay 30, story premise 25, role selection 25, interactive-fiction history 20. Each selected signal requires its mapped approved fact ID.
- Trial intent: solution-aware 25, immediate-use 30, experience-seeking 30, action language 15.
- Revenue intent: commercial comparison 30, alternative seeking 25, purchase language 40, recurring use 15; totals are capped at 100.
- Intent specificity: defined task 30, defined format 25, defined audience 25, narrow modifier 20.
- IP risk: original generic 0, ambiguous reference 50, third-party IP 100.
- Cannibalization and originality: new intent 10/90, adjacent intent 45/70, same intent 90/30.

`new_intent` must not name an existing slug. `adjacent_intent` and `same_intent` must name a currently published nearest slug; the builder derives the existing URL from that page. A same-intent candidate consolidates instead of creating another route.

Raw input values for product fit, trial intent, revenue intent, specificity, originality, IP risk, and cannibalization risk are ignored. Only the derived values appear in a policy-version 4 report with `scoreBasis: "evidence_signals_v1"`.

## Proxy and observed data

`demandScore` and `difficulty` remain 0-100 public-web research proxies. They need evidence and rationale, but they never masquerade as Search Console or provider observations. Search Console impressions, clicks, CTR, and position stay in `performance`; landing UV and conversion outcomes stay in the growth portfolio.

The publication decision therefore uses two layers:

1. Evidence-derived intent and safety gates decide whether a candidate is eligible.
2. Observed search, UV, outbound, trial, payment, and revenue data decide whether the portfolio should create, improve, consolidate, or observe.
