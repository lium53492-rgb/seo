export type ProductMigrationHoldValidation = {
  holdSlugs: string[];
  allowlistBySlug: Map<string, Record<string, unknown>>;
};

export function validateProductMigrationHoldPolicy(
  policy: unknown,
): ProductMigrationHoldValidation;

export function assertPreservedProductMigrationHolds(
  policy: unknown,
  pageArtifacts: unknown,
): string[];
