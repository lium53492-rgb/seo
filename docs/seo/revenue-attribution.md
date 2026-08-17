# Playworlds SEO revenue attribution

## Current boundary

Search Console clicks and landing UV are aggregated by source slug and complete
Shanghai reporting period. A user-initiated product outbound receives a random
`seo_click_id`; that identifier is reserved for the outbound-to-product event
chain and contains no personal information.

The current outbound route is:

```text
/guides/go/playworlds/<source-slug>?location=<cta-location>
```

It accepts only a currently published source slug. The server creates a UUID,
normalizes the CTA location, appends the approved attribution parameters, and
returns a non-cacheable 307 redirect to the official Playworlds Steam listing:

```text
https://store.steampowered.com/app/4911480/Playworlds/
```

The destination allowlist requires HTTPS, the exact Steam hostname and app
path, no credentials, and no preloaded query or fragment. An optional
`PLAYWORLDS_DESTINATION_URL` must resolve to that same approved listing.

## Outbound parameters and events

The redirect carries:

```text
utm_source=playworlds_guides
utm_medium=organic_landing
utm_campaign=playworlds_seo
utm_content=<source-slug>
utm_term=<researched-keyword>
seo_click_id=<uuid>
seo_source_slug=<source-slug>
seo_cta_location=<normalized-location>
seo_product=playworlds
seo_attribution_version=1
```

The versioned runtime event names are:

- browser click: `playworlds_outbound_click`;
- server navigation: `playworlds_outbound_navigation`;
- qualified stored event: `playworlds_qualified_outbound_click`;
- non-qualified audit event: `playworlds_outbound_request`;
- persistence result/failure: `playworlds_outbound_persistence` and
  `playworlds_outbound_persistence_failed`.

A GET with `Sec-Fetch-User: ?1` is a qualified navigation. Other GET requests
remain audit-only and do not increase `qualifiedOutboundClicks`. HEAD resolves
the same safe destination without writing a funnel event, so the live release
verifier can validate the redirect contract without polluting traffic data.

Upstash records product-namespaced idempotency keys and page/day aggregates.
Playworlds click records carry `product=playworlds`; the retained legacy
NovelAI callback cannot join those clicks. This prevents an old integration
secret or callback from being mistaken for Playworlds revenue evidence.

## Conversion callback status

No signed Playworlds trial, signup, purchase, or revenue callback contract has
been implemented or verified. `/api/attribution/readiness` therefore reports
`playworlds_callback` as unavailable and keeps `outboundToRevenue` and
`fullLoop` false. `npm run growth:probe` returns the same unavailable state and
exits non-zero. Do not infer downstream conversions from Steam visits, old
NovelAI callbacks, an existing `ATTRIBUTION_SECRET`, or an external sink.

Implementing the future callback requires separate product-server evidence:
an approved event schema, secret ownership, retry/idempotency rules, privacy
review, a signed handshake, and a deployed probe. Until then, reports may use
observed Search Console, landing, and Playworlds outbound aggregates only, with
downstream fields explicitly unavailable.

## Legacy compatibility

`/go/novelai/{slug}`, the legacy conversion endpoint, the NovelAI handshake,
and `npm run growth:probe:legacy-novelai` remain only so dated artifacts and
old integrations can be audited. Current-schema pages and current release
verification reject that CTA route. Historical reports and page payloads must
not be rewritten to hide their original contract.

## Production configuration

- `NEXT_PUBLIC_SITE_URL=https://www.playworlds.ai`
- `GOOGLE_SEARCH_CONSOLE_SITE_URL=sc-domain:playworlds.ai` (recommended), or a
  verified URL-prefix property that covers `https://www.playworlds.ai/guides/`
- `SEO_REPORT_SITE_URL=https://lorelens.playworlds.ai` for protected root-level
  child-service APIs; it is not the public canonical URL
- `PLAYWORLDS_DESTINATION_URL` is optional and may only repeat the approved
  Steam listing above
- `SEO_AUTOMATION_TOKEN` protects growth-readiness automation
- Upstash and landing-analytics variables retain their existing roles

The main Playworlds Microfrontends route, root robots declaration, and matching
Search Console property still require independent production verification.
Code configuration alone is not deployment evidence.
