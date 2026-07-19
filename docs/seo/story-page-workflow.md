# Independent Story SEO Workflow

This is the active workflow for the current SEO site.

## Strategy

Create independent English SEO landing pages for specific NovelAI stories, then send users to the exact NovelAI story URL.

Traffic path:

```text
Google search
-> independent SEO landing page
-> Play CTA
-> NovelAI story page
```

The goal is not to rank for the NovelAI brand at first. The goal is to find lower-competition story and scenario keywords that match individual stories.

## Page Requirements

Each story SEO page needs:

- One target keyword.
- One specific story destination URL.
- A title and meta description built around the story scenario.
- A clear above-the-fold Play CTA.
- Story premise.
- What the player can do.
- Who the story is for.
- FAQ structured data.
- Sitemap inclusion.

Use `next-seo` for structured data components such as `FAQJsonLd`. Keep ordinary metadata in Next.js native `metadata` or `generateMetadata`.

## Avoid Doorway Pages

The page must not be a thin redirect page. It needs useful standalone content:

- Explain the story setup.
- Describe the roleplay experience.
- Mention the setting and choices.
- Help the user decide whether this story fits them.
- Use original writing, not copied platform text.

## First Page

Keyword:

- `2000s marriage life simulator`

URL:

- `/`

Destination:

- `https://www.novelai.ai/story/9b61e7e9-772c-44ad-b318-5f76db9c993a/episode/bd7eaf4e-a4d7-411f-a71b-f2fb4216b410?progression=guided&scenarioId=scenario-1&preventRepeatChoices=1`

## Daily Production

For each new story:

1. Copy the story share URL.
2. Record title, tags, description, and visible story stats.
3. Pick one English low-competition keyword.
4. Create a landing page focused on that keyword.
5. Point CTA buttons to the exact story URL.
6. Add `next-seo` structured data where it matches visible page content.
7. Build and verify locally.
8. Deploy to Vercel.
9. Submit sitemap or request indexing.
