# Playworlds SEO revenue attribution

## Current boundary

Search Console clicks and landing UV are aggregated by source slug and complete
Shanghai reporting period. A user-initiated product outbound receives a random
`seo_click_id`; that identifier is reserved for the outbound-to-product event
chain and contains no personal information.

The current outbound route is:

```text
/go/playworlds/<source-slug>?location=<cta-location>
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

## Signed Playworlds callback receiver

LoreLens implements a product-specific, fail-closed receiver at:

```text
POST /api/attribution/playworlds/conversion
POST /api/attribution/playworlds/handshake
```

The receiver does not reuse the legacy `ATTRIBUTION_SECRET`. Both endpoints
require a server-only `PLAYWORLDS_CALLBACK_SECRET` containing at least 32 UTF-8
bytes, `Content-Type: application/json`, and these headers:

```text
x-playworlds-timestamp: <current Unix seconds>
x-playworlds-delivery-id: <eventId or probeId UUID>
x-playworlds-signature: v1=<lowercase HMAC-SHA256 hex>
```

The exact HMAC input is the UTF-8 sequence below, including the three newline
characters and the raw request body exactly as transmitted:

```text
v1\n<timestamp>\n<delivery-id>\n<raw-json-body>
```

The receiver allows at most five minutes of clock skew, rejects modified or
unsigned bodies with a constant-time digest comparison, rejects bodies larger
than 16 KiB, and requires the delivery ID to equal the body `eventId` or
`probeId`. Signing happens after JSON serialization; reserializing the body
after signing invalidates the request.

The strict conversion body is:

```json
{
  "schemaVersion": 1,
  "producer": "playworlds",
  "product": "playworlds",
  "eventId": "<uuid>",
  "clickId": "<seo_click_id uuid>",
  "sourceSlug": "<LoreLens source slug>",
  "event": "trial_started",
  "occurredAt": "<ISO-8601 timestamp>",
  "revenueMinor": 1299,
  "currency": "USD"
}
```

The accepted event names are `trial_started`, `signup_completed`, and
`purchase_completed`. `revenueMinor` and `currency` are required only for `purchase_completed` and
are rejected on the other event types. The body contains no email, account ID,
name, transcript, IP address, or other user profile data. `eventId` is the
idempotency key, while `clickId` joins only to the outbound record created by
LoreLens. A mismatched product or source is rejected when a retained click is
present; an event with no retained outbound click—including a delayed event for
a retired source or an unknown source—is stored as an explicit global orphan so the publication gate can
stop rather than hide a broken join. The product sender should retry timeouts
and `5xx` responses with the same body and `eventId`; it must not mint a new ID
for a retry. A `202` response is the durable acknowledgement.

The handshake uses the same signature contract and this strict body:

```json
{
  "schemaVersion": 1,
  "probeId": "<uuid>",
  "producer": "playworlds",
  "product": "playworlds",
  "occurredAt": "<ISO-8601 timestamp>"
}
```

Run `npm run growth:probe` from the Playworlds server environment after the
receiver is deployed or the shared secret is rotated. The probe writes only a
short-lived handshake receipt and never creates a click, trial, signup,
purchase, or revenue event.

## Operational readiness boundary

Receiver code is not evidence that the product sender is connected.
`/api/attribution/readiness` reports `playworlds_callback` as configured only
when both the product-specific secret and durable attribution store exist. It
reports `outboundToRevenue=true` only after a recent signed Playworlds
handshake. Downstream metrics remain unavailable when that handshake is absent
or stale, even if Redis itself can return zero-valued hashes. When the configured
policy blocks orphan callbacks, the receiver's global orphan total must also be
observed as zero; any positive or unavailable total keeps both
`outboundToRevenue` and `fullLoop` false.

The SEO repository cannot generate real product outcomes. The Playworlds
service must preserve the inbound `seo_click_id` and `seo_source_slug`, map an
actual approved product event to the versioned body, sign it, and send it. Do
not infer conversions from Steam visits, run a fabricated conversion as a
production probe, reuse an old NovelAI event, or interpret receiver deployment
as a completed revenue loop.

## Legacy compatibility

`/go/novelai/{slug}`, the legacy conversion endpoint, the NovelAI handshake,
and `npm run growth:probe:legacy-novelai` remain only so dated artifacts and
old integrations can be audited. Current-schema pages and current release
verification reject that CTA route. Historical reports and page payloads must
not be rewritten to hide their original contract.

## Production configuration

- `NEXT_PUBLIC_SITE_URL=https://lorelens.playworlds.ai`
- `GOOGLE_SEARCH_CONSOLE_SITE_URL=https://lorelens.playworlds.ai/` or a verified
  domain property that covers `lorelens.playworlds.ai`
- `PLAYWORLDS_DESTINATION_URL` is optional and may only repeat the approved
  Steam listing above
- `SEO_AUTOMATION_TOKEN` protects growth-readiness automation
- `PLAYWORLDS_CALLBACK_SECRET` protects only the signed Playworlds receiver and
  must contain at least 32 random bytes
- Upstash and landing-analytics variables retain their existing roles

The canonical domain, DNS/Vercel attachment, and matching Search Console
property still require independent production verification. Code configuration
alone is not deployment evidence.
