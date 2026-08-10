export type AudiencePolicyContext = {
  reportDate?: string;
};

export function audienceCandidateBlockers(
  candidate: Record<string, any>,
  policy: Record<string, any>,
  context?: AudiencePolicyContext,
): string[];

export function audienceDraftBlockers(input: {
  policy: Record<string, any>;
  reportDate?: string;
  keyword?: unknown;
  h1?: unknown;
  factIds?: unknown[];
  architecture?: Record<string, any>;
  visibleText?: unknown;
}): string[];
