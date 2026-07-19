# Engineering Workflow for Story SEO Pages

This document explains the production system we built for stable daily SEO output.

## Current Strategy

We are not trying to rank for the NovelAI brand first.

The current SEO path is:

```text
Low-competition English search keyword
-> Independent story SEO landing page
-> Play CTA
-> NovelAI story share URL
```

Example:

```text
2000s marriage life simulator
-> https://seo-pi-fawn.vercel.app
-> /go/story/2000s-marriage-life-simulator
-> NovelAI story page
```

This works well for daily publishing because each page can target one concrete story, scene, or roleplay fantasy.

## Engineering Structure

```text
app/
  layout.tsx
  page.tsx
  robots.ts
  sitemap.ts
  components/
    TrackedStoryLink.tsx
  go/
    story/
      2000s-marriage-life-simulator/
        route.ts

docs/
  seo/
    README.md
    daily-workflow.md
    story-page-workflow.md
    engineering-workflow.md
    page-brief-template.md
    page-tracker.csv
    30-day-topic-plan.csv
    briefs/

public/
  googlea20e574c62693e98.html
```

## File Responsibilities

`app/layout.tsx`

- Site-wide layout.
- Global SEO defaults.
- Vercel Analytics component.

`app/page.tsx`

- First story SEO landing page.
- Page-level metadata.
- Visible content.
- FAQ structured data using `next-seo`.
- Play CTAs.

`app/components/TrackedStoryLink.tsx`

- Client-side Play CTA wrapper.
- Tracks `story_play_click` in Vercel Analytics.
- Sends users to an internal redirect URL.

`app/go/story/.../route.ts`

- Internal redirect route.
- Logs `story_play_redirect` to Vercel runtime logs.
- Redirects to the exact NovelAI story URL.

`app/sitemap.ts`

- Generates sitemap.
- Search Console reads this to discover pages.

`app/robots.ts`

- Allows crawling.
- Points crawlers to sitemap.

`public/googlea20e574c62693e98.html`

- Google Search Console ownership verification file.
- Do not delete it.

## Where `next-seo` Fits

We use `next-seo` for structured data, not for normal metadata.

Use Next.js native metadata for:

- `title`
- `description`
- canonical URL
- Open Graph title and description
- Twitter metadata

Use `next-seo` for:

- `FAQJsonLd`
- `ArticleJsonLd`
- `SoftwareApplicationJsonLd`
- `BreadcrumbJsonLd`
- Other schema.org JSON-LD blocks

Why:

- Next.js App Router already has first-class metadata support.
- `next-seo` reduces manual JSON-LD mistakes.
- This keeps page metadata predictable and structured data reusable.

## Daily Page Production Flow

1. Choose one story.
2. Copy its NovelAI story share URL.
3. Pick one low-competition English keyword.
4. Create or update the story data.
5. Create the landing page route.
6. Add visible content that matches the keyword.
7. Add structured data with `next-seo`.
8. Add a `/go/story/{slug}` redirect route.
9. Add the page to sitemap.
10. Run build locally.
11. Commit and push.
12. Verify Vercel deployment.
13. Submit or inspect URL in Google Search Console.
14. Record the page in `page-tracker.csv`.

## Stability Rules

- One story page targets one keyword.
- One page must have one H1.
- The page must contain useful standalone content, not only a redirect.
- The visible FAQ must match the `FAQJsonLd` data.
- Every Play CTA should go through `/go/story/{slug}` for tracking.
- Do not delete Search Console verification files.
- Do not manually edit generated build output.
- Keep metadata, sitemap, and canonical URLs aligned with the production domain.

## Bug Control

Before every push:

```bash
npm run build
```

Build catches:

- TypeScript errors.
- Broken imports.
- Invalid App Router files.
- Route generation errors.
- Metadata typing issues.

Manual checks:

- Open the page locally or on Vercel.
- Click the Play CTA.
- Confirm it redirects to NovelAI.
- Open `/sitemap.xml`.
- Open `/robots.txt`.
- Check Vercel deployment status.

Data checks:

- Vercel Analytics: page views and visitors.
- Vercel Logs: `story_play_redirect`.
- Google Search Console: index status, queries, clicks, impressions.

## Why This Can Scale Daily

The system separates repeatable parts from creative parts.

Repeatable:

- Route structure.
- Metadata fields.
- Sitemap.
- Robots.
- FAQ schema.
- CTA tracking.
- Redirect logging.
- Build verification.

Creative:

- Story premise.
- Keyword selection.
- Page copy.
- FAQ wording.
- Visual direction.

This means each new page should mostly be content and story data, while the engineering surface stays stable.

