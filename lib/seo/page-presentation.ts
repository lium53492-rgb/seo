import type { ContentStrategy, PublishedSeoPage } from "./types";

export type SeoPageFamily = ContentStrategy["pagePattern"];

export type RelatedSeoPage = {
  anchor: string;
  href: string;
  target: PublishedSeoPage;
};

const legacyFamilyBySlug: Record<string, SeoPageFamily> = {
  "ai-voice-roleplay-story": "experience_explainer",
  "choose-a-role-ai-story": "task_guide",
  "interactive-voice-story": "decision_page",
  "story-based-ai-roleplay": "narrative_essay",
};

export function resolveSeoPageFamily(page: PublishedSeoPage): SeoPageFamily {
  return page.pagePattern ?? legacyFamilyBySlug[page.slug] ?? "experience_explainer";
}
