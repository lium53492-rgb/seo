import type { ContentStrategy, PublishedSeoPage } from "./types";

export type SeoPageFamily = ContentStrategy["pagePattern"];

export type RelatedSeoPage = {
  anchor: string;
  href: string;
  target: PublishedSeoPage;
};

export function resolveRelatedSeoPages(
  page: PublishedSeoPage,
  publishedPages: PublishedSeoPage[],
): RelatedSeoPage[] {
  const targetsByPath = new Map(
    publishedPages
      .filter((candidate) => candidate.path !== page.path)
      .map((candidate) => [candidate.path, candidate]),
  );
  const relatedPages: RelatedSeoPage[] = [];
  const linkedPaths = new Set<string>();

  for (const link of page.internalLinks) {
    const target = targetsByPath.get(link.href);
    if (!target || linkedPaths.has(link.href)) continue;
    relatedPages.push({ ...link, target });
    linkedPaths.add(link.href);
  }

  for (const target of targetsByPath.values()) {
    if (linkedPaths.has(target.path)) continue;
    relatedPages.push({
      anchor: target.h1,
      href: target.path,
      target,
    });
  }

  return relatedPages;
}

const legacyFamilyBySlug: Record<string, SeoPageFamily> = {
  "ai-voice-roleplay-story": "experience_explainer",
  "choose-a-role-ai-story": "task_guide",
  "interactive-voice-story": "decision_page",
  "story-based-ai-roleplay": "narrative_essay",
};

export function resolveSeoPageFamily(page: PublishedSeoPage): SeoPageFamily {
  return page.pagePattern ?? legacyFamilyBySlug[page.slug] ?? "experience_explainer";
}
