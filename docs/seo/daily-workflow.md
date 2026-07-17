# Daily SEO Workflow

Use this workflow every time a new page is created.

## 1. Pick Topic

Where:

- 3ue analytics
- Google Search Console
- Google autocomplete
- Existing NovelAI stories, characters, and tags
- Competitor search result pages

Purpose:

- Find a user intent that NovelAI can satisfy with a real product experience.

Output:

- Main keyword
- Secondary keywords
- Page URL
- Search intent

## 2. Create Page Brief

Where:

- ChatGPT or Codex

Purpose:

- Turn the keyword into a clear page plan.

Required fields:

- Main keyword
- Target user
- Search intent
- URL
- Title
- Meta description
- H1
- Page sections
- FAQ
- Related pages
- CTA

Use:

- `docs/seo/page-brief-template.md`

## 3. Draft Content

Where:

- ChatGPT
- Codex

Purpose:

- Create the first version of page copy.

Rules:

- Include real product details.
- Mention interactive story, roleplay, characters, voice, memory, branching, or story creation only where they are true.
- Do not overclaim rankings, safety, companionship, or human-like emotion.
- Do not target copyrighted franchises as the main keyword.

## 4. Edit

Where:

- VSCode
- Product notes

Purpose:

- Make the draft accurate, specific, and conversion-focused.

Checklist:

- Is the first screen clear within 5 seconds?
- Does the page explain what the user can do?
- Is there a direct start/play CTA?
- Are there related stories or characters?
- Does the page avoid generic AI filler?

## 5. Implement

Where:

- Codex

Purpose:

- Turn the brief into a real website page.

Technical checklist:

- Add route.
- Add page component.
- Add title and meta description.
- Add canonical URL.
- Add Open Graph title and description.
- Add FAQ structured data if FAQ is present.
- Add internal links.
- Add sitemap entry.

## 6. Verify

Where:

- Local dev server
- Browser
- Build command

Purpose:

- Make sure the page works before publishing.

Checklist:

- Page loads on desktop and mobile.
- H1 appears once.
- Text is visible without login.
- Links work.
- CTA works.
- Build passes.
- No obvious layout overlap.

## 7. Publish

Where:

- Vercel, Netlify, or current deployment platform

Purpose:

- Make the URL live.

After publishing:

- Open the live URL.
- Check title and description.
- Add URL to sitemap if not automatic.

## 8. Submit and Track

Where:

- Google Search Console
- Bing Webmaster Tools
- 3ue analytics
- `docs/seo/page-tracker.csv`

Purpose:

- Make search engines discover the page and measure results.

Record:

- Publish date
- URL
- Main keyword
- Page type
- Index status
- Impressions
- Clicks
- Registrations
- Notes

