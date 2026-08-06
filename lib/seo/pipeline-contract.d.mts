export type RequiredReviewChecksInput = {
  draftSchemaVersion: number | null;
  requiredDraftSchemaVersion: number;
  baseRequiredChecks: readonly string[];
  architectureRequiredChecks: readonly string[];
};

export type ReviewContractInput = RequiredReviewChecksInput & {
  review: Record<string, unknown>;
  reportId: string | null;
  expectedSlug: string | null;
  expectedDigest: string | null;
  reportGeneratedAt: string | null;
};

export function requiredReviewCheckIds(input: RequiredReviewChecksInput): string[];
export function validatePipelineReviewContract(input: ReviewContractInput): boolean;
export function repositoryPublicationStage(publicationStatus: string | null): "repository_published" | null;
