export type ContentContractInput = {
  draft: Record<string, unknown>;
  contentStrategy: Record<string, unknown>;
  candidate?: Record<string, unknown>;
  pages?: Array<Record<string, unknown>>;
  architecturePolicy: Record<string, any>;
  presentationCatalog: Record<string, any>;
};

export function isPageArchitecture(value: unknown): boolean;
export function validateArchitecturePolicy(policy: Record<string, any>): Record<string, any>;
export function validateSeoArchitectureBridge(
  seoPolicy: Record<string, any>,
  architecturePolicy: Record<string, any>,
): Record<string, any>;
export function validatePublishedPageArchitecture(input: {
  page: Record<string, any>;
  architecturePolicy: Record<string, any>;
  presentationCatalog: Record<string, any>;
}): { architecture: Record<string, any>; recipe: Record<string, any> };
export function resolvePresentationRecipe(catalog: Record<string, any>, recipeId: string): Record<string, any>;
export function validatePresentationRecipeCatalog(
  catalog: Record<string, any>,
  architecturePolicy: Record<string, any>,
): Record<string, any>;
export function validatePageArchitecture(input: ContentContractInput): {
  architecture: Record<string, any>;
  recipe: Record<string, any>;
};
