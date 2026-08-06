export type PublishedArchitectureHistoryEntry = {
  slug: string;
  sourceReportId: string;
  effectiveAt: string;
  pagePattern: string | null;
  architecture: Record<string, any>;
  signatureModule: Record<string, any>;
};

export function publishedArchitectureHistoryFromReports(
  reports: Array<Record<string, any>>,
): PublishedArchitectureHistoryEntry[];
