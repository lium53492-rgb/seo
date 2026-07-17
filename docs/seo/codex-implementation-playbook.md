# Codex Implementation Playbook

Use this file when the website source code is available.

## First Task

Implement the SEO landing page:

- URL: `/voice-roleplay`
- Brief: `docs/seo/briefs/voice-roleplay.md`

## Discovery Steps

1. Inspect project files.
   - Find framework: Next.js, Vite, Remix, Astro, or custom.
   - Find page routing directory.
   - Find shared layout and SEO metadata helpers.
   - Find sitemap generation.
   - Find existing card, CTA, FAQ, and hero components.

2. Reuse existing patterns.
   - Match current design system.
   - Reuse existing buttons, cards, grids, and link components.
   - Do not introduce a new UI library just for SEO pages.

3. Check deployment scripts.
   - Identify build command.
   - Identify lint/test command if present.

## Required Page Elements

- One visible H1.
- Descriptive hero copy.
- CTA above the fold.
- Section explaining what voice roleplay is.
- Section explaining how it works.
- Section comparing it with ordinary AI character chat.
- Scenario list.
- Related stories or characters.
- FAQ.
- Internal links.

## Required SEO Elements

- Title: `Voice Roleplay with AI Characters | NovelAI`
- Meta description: `Start voice roleplay with AI characters in interactive stories. Choose a scene, speak with characters, and shape the story through your choices.`
- Canonical: `https://www.novelai.ai/voice-roleplay`
- Open Graph title and description.
- FAQ structured data if supported by the stack.
- Sitemap entry.

## QA Checklist

- Page loads locally.
- Desktop layout works.
- Mobile layout works.
- H1 appears once.
- Metadata is generated.
- CTA link works.
- Internal links work.
- Build passes.

## After Shipping

Update `docs/seo/page-tracker.csv`:

- Set status to `published`.
- Add live publish date.
- Add notes about implementation.

Submit or verify:

- Sitemap contains the URL.
- Google Search Console can inspect the URL.
- Analytics can track page visits and CTA clicks.

