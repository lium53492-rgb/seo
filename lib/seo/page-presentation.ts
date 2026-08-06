import type { ContentStrategy, PageArchitecture, PublishedSeoPage } from "./types";
import presentationCatalog from "@/data/config/presentation-recipes.json";
import architecturePolicy from "@/data/config/content-architecture.json";
import seoPolicy from "@/data/config/seo-policy.json";
import { validateSeoArchitectureBridge } from "./content-contract.mjs";

validateSeoArchitectureBridge(seoPolicy, architecturePolicy);

export type SeoPageFamily = ContentStrategy["pagePattern"];

export type RelatedSeoPage = {
  anchor: string;
  href: string;
  target: PublishedSeoPage;
};

export type PresentationRecipe = {
  id: string;
  rendererId: PageArchitecture["presentation"]["rendererId"];
  companion: PageArchitecture["presentation"]["companion"];
  gallery: "none";
};

const rendererIds: ReadonlyArray<PresentationRecipe["rendererId"]> = [
  "rehearsal_slate",
  "nocturne_decision_grid",
  "product_field_manual",
  "editorial_argument",
  "specimen_catalog",
  "orbital_mission_log",
  "playful_story_workshop",
];

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

  return relatedPages;
}

export function resolvePagePresentation(page: PublishedSeoPage): PresentationRecipe | null {
  if (page.schemaVersion !== seoPolicy.contentArchitecture.publishedPageSchemaVersion || !page.architecture) return null;
  const recipe = presentationCatalog.recipes.find(
    (recipe) => recipe.id === page.architecture?.presentation.recipeId,
  );
  if (!recipe || !rendererIds.includes(recipe.rendererId as PresentationRecipe["rendererId"]) ||
    (recipe.companion !== "none" && recipe.companion !== "story_companion") || recipe.gallery !== "none") {
    return null;
  }
  return {
    id: recipe.id,
    rendererId: recipe.rendererId as PresentationRecipe["rendererId"],
    companion: recipe.companion,
    gallery: recipe.gallery,
  };
}

const legacyCompanionBySlug: Readonly<Record<string, "story_companion">> = {
  "interactive-voice-story": "story_companion",
};

export function resolveCompanionPolicy(
  page: PublishedSeoPage,
  recipe: PresentationRecipe | null,
): "none" | "story_companion" {
  return recipe?.companion ?? legacyCompanionBySlug[page.slug] ?? "none";
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
