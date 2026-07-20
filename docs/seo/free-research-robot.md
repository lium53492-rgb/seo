# Free Codex SEO research robot

This protocol replaces paid keyword-provider data with transparent research proxies. It does not scrape Google result HTML and never labels proxy scores as search volume or keyword difficulty.

## Daily research inputs

1. Read `lib/seo/product-facts.ts` and use only approved product facts.
2. Search the public web for the configured seed topics, close variants, user questions, competitor pages, and recent discussions.
3. Keep at least five accessible evidence URLs from at least three independent domains.
4. Prefer first-party product pages, current search-result pages surfaced by the Codex web search tool, community discussions, and dated editorial coverage.
5. Exclude unlicensed entertainment IP and sources that cannot be opened.

## Proxy scores

- `demandScore` (0–100): repeated query/theme presence across independent sources, recency, user discussion, and action-oriented intent.
- `difficulty` (0–100): strength of dedicated pages already ranking, brand concentration, exact-match coverage, and depth of competing content.
- These are directional proxies. They are not monthly search volume, CPC, or Semrush KD.
- Set `volume` and `cpc` indirectly through the builder; never invent them in the research input.

## Research input

Create `data/research/YYYY-MM-DD.json` with:

```json
{
  "date": "YYYY-MM-DD",
  "generatedAt": "ISO-8601 timestamp",
  "candidates": [
    {
      "keyword": "multiplayer voice roleplay",
      "seed": "voice roleplay",
      "demandScore": 70,
      "difficulty": 35,
      "intent": "commercial",
      "productFit": 95,
      "originality": 82,
      "conversionIntent": 88,
      "ipRisk": 0,
      "cannibalizationRisk": 10
    }
  ],
  "evidence": [
    {
      "title": "Source page title",
      "url": "https://example.com/page",
      "source": "Example",
      "collectedAt": "ISO-8601 timestamp",
      "supports": ["multiplayer voice roleplay"]
    }
  ]
}
```

Use 5–12 candidates. Every candidate must be supported by at least one evidence item. Do not add a draft unless the page content has also passed the product-fact constraints in `lib/seo/product-facts.ts`.

## Build and publish

Run:

```text
npm run research:build -- data/research/YYYY-MM-DD.json
npm run check
```

The builder validates the research, calculates the opportunity score, and writes `data/reports/YYYY-MM-DD.json`. Commit only the two daily JSON files unless the application itself needs a separately reviewed change.
