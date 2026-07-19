# NovelAI SEO Production System

This folder is the operating kit for shipping one SEO page per day for NovelAI.

## Goal

Build a repeatable pipeline that turns product features, story categories, roleplay scenarios, and user search demand into indexable landing pages.

Primary business goal:

- Acquire users searching for AI interactive story, AI roleplay, AI character chat, and voice roleplay experiences.

Primary SEO goal:

- Publish useful, crawlable pages that match one clear search intent each.

## Page Types

1. Product pages
   - Purpose: rank for high-value product category terms.
   - Examples: `/voice-roleplay`, `/ai-interactive-story-game`, `/ai-roleplay-game`.

2. Scenario pages
   - Purpose: rank for long-tail user intents.
   - Examples: `/roleplay/romance`, `/roleplay/fantasy`, `/story-game/life-simulator`.

3. Explainer pages
   - Purpose: educate users and support internal linking.
   - Examples: `/guides/what-is-ai-roleplay`, `/guides/how-to-play-ai-text-rpg`.

4. Product update pages
   - Purpose: show freshness and explain new features.
   - Examples: `/updates/voice-roleplay-launch`.

5. Story and character detail pages
   - Purpose: capture specific long-tail searches and convert directly into play sessions.

## Non-Negotiables

- One page = one main keyword and one search intent.
- Every page must include a visible product action, such as starting a story or choosing a character.
- Every page must link to at least 3 related internal pages.
- Avoid using unlicensed third-party IP names as primary SEO targets.
- AI-generated drafts must be edited for real product detail before publishing.
- Every published URL must be added to the tracking sheet.

## Two-Day Launch Plan

Day 1:

- Ship `/voice-roleplay`.
- Add title, meta description, canonical URL, FAQ schema, and internal links.
- Add URL to sitemap.
- Record URL in `docs/seo/page-tracker.csv`.

Day 2:

- Ship `/ai-interactive-story-game`.
- Reuse the same landing page structure.
- Link both pages to each other.

## Weekly Cadence

Monday:

- Choose 7 topics for the week.
- Check indexed pages and impressions.

Tuesday to Sunday:

- Publish one page per day.
- Record URL, keyword, status, and notes.

Friday:

- Improve 2 existing pages based on data.
- Update titles, descriptions, internal links, or FAQs where needed.

## Current Implementation Notes

The live SEO site is a Next.js App Router project deployed on Vercel.

Use:

- Next.js native metadata for titles, descriptions, canonicals, and Open Graph.
- `next-seo` for structured data JSON-LD, such as `FAQJsonLd`.
- Vercel Analytics for page views and Play CTA click events.
- Internal `/go/story/{slug}` routes for redirect logging and click tracking.

See `docs/seo/engineering-workflow.md` for the engineering production system.
