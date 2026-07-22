# SEO to revenue attribution contract

## Goal

Measure the complete search-to-revenue path without pretending every source exposes user-level data. Search Console clicks and Vercel landing UV aggregate by source slug and reporting period. The qualified NovelAI outbound, trial, signup, payment, and attributed revenue events join with `seo_click_id`, which contains no personal information.

## Outbound request

Every SEO CTA points to:

```text
/go/novelai/<source-slug>?location=<cta-location>
```

The route validates that the source is a published page, creates a UUID, logs `qualified_outbound_click`, and redirects to the approved NovelAI host with:

```text
utm_source=novelai_seo
utm_medium=organic_landing
utm_campaign=seo_revenue
utm_content=<source-slug>
utm_term=<researched-keyword>
seo_click_id=<uuid>
seo_source_slug=<source-slug>
seo_cta_location=<location>
```

The destination host is allowlisted to `novelai.ai` and `www.novelai.ai` over HTTPS.

## NovelAI integration

On the NovelAI application:

1. Read `seo_click_id`, `seo_source_slug`, and UTM values on first arrival.
2. Store them with the anonymous session and carry them into the authenticated account when signup occurs.
3. Create a unique `eventId` for every trial, signup, or payment event.
4. POST the event server-to-server to `https://seo-pi-fawn.vercel.app/api/attribution/conversion` with `Authorization: Bearer <ATTRIBUTION_SECRET>`.
5. Retry non-2xx responses and deduplicate by `eventId` in the durable analytics or payment sink.
6. Do not send email, display name, raw payment identifiers, or other personal data.

Example event shape:

```json
{
  "schemaVersion": 1,
  "eventId": "UUID",
  "clickId": "UUID from seo_click_id",
  "sourceSlug": "play-an-ai-roleplay-story",
  "event": "trial_started",
  "occurredAt": "ISO-8601 timestamp"
}
```

For `purchase_completed`, also send integer `revenueMinor` and an uppercase three-letter `currency` such as `USD`.

## Environment variables

SEO Vercel project:

- `NOVELAI_DESTINATION_URL`: optional approved NovelAI URL; defaults to the current Chinese home route.
- `ATTRIBUTION_SECRET`: required for conversion callbacks.
- `ATTRIBUTION_SINK_URL`: optional durable event sink. When configured, a sink failure returns 502 so NovelAI can retry.
- `ATTRIBUTION_SINK_TOKEN`: optional bearer token for the sink.

NovelAI application:

- Store the same `ATTRIBUTION_SECRET` only on the server.
- Never expose it in browser JavaScript.

## Funnel report

Each daily research input must include a funnel snapshot for a stated period. Use `aggregationKey: "source_slug+reporting_period"` for search and UV, and `conversionJoinKey: "seo_click_id"` for the event-level conversion segment. The seven metrics are organic clicks, landing UV, qualified outbound clicks, trial starts, signups, paid conversions, and revenue in minor units. Each metric must be either:

- `observed`: non-negative value, named source, and collection note; or
- `unavailable`: `null` value, named expected source, and a specific reason.

Vercel Analytics supplies UV but is not the payment system. The shared SEO-tool account supplies keyword research but is not a traffic or revenue source. The workbench must keep those boundaries visible.
