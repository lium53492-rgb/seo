export type NoveltyViolation = {
  code: string;
  detail: string;
  slug?: string;
  value?: number;
  threshold?: number;
};

export type NoveltyAudit = {
  schemaVersion: 1;
  passed: boolean;
  corpusDigest: string;
  nearest: Array<Record<string, unknown>>;
  internal: {
    maxSectionPairCosine: number;
    maxFaqPairCosine: number;
    repeatedSentenceCount: number;
  };
  violations: NoveltyViolation[];
};

export function normalizeContentText(value: unknown): string;
export function cosineSimilarity(left: unknown, right: unknown): number;
export function shingleContainment(left: unknown, right: unknown, size?: number): number;
export function visiblePageText(page: Record<string, unknown>): string;
export function renderedCopyFragments(page: Record<string, unknown>): string[];
export function analyzeContentNovelty(input: {
  draft: Record<string, any>;
  pages?: Array<Record<string, any>>;
  architecturePolicy: Record<string, any>;
  presentationCatalog: Record<string, any>;
  allowedPhrases?: string[];
  architectureHistory?: Array<Record<string, any>>;
}): NoveltyAudit;
