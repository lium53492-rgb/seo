export type RequiredReviewChecksInput = {
  draftSchemaVersion: number | null;
  requiredDraftSchemaVersion: number;
  baseRequiredChecks: readonly string[];
  architectureRequiredChecks: readonly string[];
};

export type ReviewContractInput = RequiredReviewChecksInput & {
  review: any;
  reportId: string | null;
  expectedSlug: string | null;
  expectedDigest: string | null;
  reportGeneratedAt: string | null;
  reportDate?: string | null;
  visualAuditPolicy?: any;
};

export type VisualAuditContractInput = {
  review: any;
  reportId?: string | null;
  reportDate?: string | null;
  expectedSlug?: string | null;
  expectedDigest?: string | null;
  reportGeneratedAt?: string | null;
  draftSchemaVersion: number | null;
  requiredDraftSchemaVersion: number;
  visualAuditPolicy?: any;
};

export function requiredReviewCheckIds(input: RequiredReviewChecksInput): string[];
export function validatePipelineReviewContract(input: ReviewContractInput): boolean;
export function validateVisualAuditContract(input: VisualAuditContractInput): boolean;
export function repositoryPublicationStage(publicationStatus: string | null): "repository_published" | null;
