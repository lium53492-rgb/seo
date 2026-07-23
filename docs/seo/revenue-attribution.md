# SEO to revenue attribution contract

## Goal

Measure the complete search-to-revenue path without pretending every source exposes user-level data. Search Console clicks and Vercel landing UV aggregate by source slug and reporting period. The qualified NovelAI outbound, trial, signup, payment, and attributed revenue events join with `seo_click_id`, which contains no personal information.

## Outbound request

Every SEO CTA points to:

```text
/go/novelai/<source-slug>?location=<cta-location>
```

The route validates that the source is a published page, creates a UUID, redirects immediately, and schedules a durable Upstash write with Next.js `after()`. Browser navigations carrying `Sec-Fetch-User: ?1` increment `qualifiedOutboundClicks`; other requests remain in `outboundRequests` for audit and do not inflate the qualified funnel. A later signed conversion can promote an otherwise unverified click.

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

Use first-touch acquisition within the product's chosen attribution lifetime: once an anonymous session has an eligible `seo_click_id`, do not replace it with a later direct visit. If the business later adopts another attribution model, version that rule instead of silently changing historical comparisons.

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
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: durable, atomic attribution storage. The Vercel Marketplace Upstash integration can inject these variables.
- `VERCEL_ANALYTICS_TOKEN`: server-only Vercel access token used by the public Web Analytics API to read page-level visitors and pageviews.
- `VERCEL_ANALYTICS_PROJECT_ID` and `VERCEL_ANALYTICS_TEAM_ID`: optional explicit API scope; this repository defaults to its current Vercel project and team IDs.
- `ATTRIBUTION_SINK_URL`: optional durable event sink. When configured, a sink failure returns 502 so NovelAI can retry.
- `ATTRIBUTION_SINK_TOKEN`: optional bearer token for the sink.

NovelAI application:

- Store the same `ATTRIBUTION_SECRET` only on the server.
- Never expose it in browser JavaScript.

## Persistence and idempotency

- Outbound events deduplicate by `clickId`.
- Trial, signup, and purchase callbacks deduplicate by `eventId`.
- Trial, signup, and paid-conversion counts are unique per click. Multiple unique purchase events may add revenue, while one acquired click still counts as one paid conversion.
- Conversion revenue is added to the Shanghai-day acquisition cohort of the original click, not the payment day. This makes page-level revenue per acquired UV meaningful.
- Report requests are rounded outward to complete Shanghai calendar days before both Redis cohorts and Vercel UV are queried. The returned `periodStart` and `periodEnd` are the actual normalized boundaries, so numerator and denominator always cover the same window.
- Revenue is stored separately for each ISO currency. The workbench never sums unlike currencies.
- If a signed callback arrives without its outbound event, it is retained under the supplied source and callback date, and `orphanCallbacks` exposes the broken join.
- Event and cohort keys expire after 400 days. No email, account ID, payment ID, IP address, or other direct personal data is stored.
- The callback returns `202` only when the internal Redis store or an explicitly configured external sink durably accepts the event. Missing storage returns `503`; transient failures return `502`; NovelAI must retry both.

## Funnel report

Each daily research input must include a funnel snapshot for a stated period. Use `aggregationKey: "source_slug+reporting_period"` for search and UV, and `conversionJoinKey: "seo_click_id"` for the event-level conversion segment. The seven metrics are organic clicks, landing UV, qualified outbound clicks, trial starts, signups, paid conversions, and revenue in minor units. Each metric must be either:

- `observed`: non-negative value, named source, and collection note; or
- `unavailable`: `null` value, named expected source, and a specific reason.

Vercel Analytics supplies UV but is not the payment system. The shared SEO-tool account supplies keyword research but is not a traffic or revenue source. The workbench must keep those boundaries visible.

The protected live view is `/workbench/attribution`. Its JSON contract is:

```text
GET /api/attribution/report?sourceSlug=<slug>&from=<ISO>&to=<ISO>
Authorization: Basic <workbench credentials>
```

`node scripts/collect-growth-funnel.mjs <slug> <from> <to>` reads the same endpoint for a daily automation. It does not invent Search Console data; organic clicks must still be copied or exported separately for the identical page and period.

The normal production command is `npm run growth:collect`. It queries every published page for the prior 28 complete Shanghai calendar days and writes `data/growth/YYYY-MM-DD.json`. The daily research file either embeds this object as `portfolioFunnels` or points to it with `portfolioSnapshot`. The report builder rejects missing pages, duplicate slugs, mismatched periods, stale snapshots, orphan callbacks, and blind expansion after the four-page cold-start allowance.
