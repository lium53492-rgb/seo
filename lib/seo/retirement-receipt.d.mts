export type RetirementAssessment = {
  state: "none" | "valid" | "invalid";
  slug: string | null;
  slugs: string[];
  retiredAt: string | null;
  retiredAts: string[];
  receipt: Record<string, unknown> | null;
  receipts: Record<string, unknown>[];
  reason: string | null;
};

export function assessPublicationRetirement(input: {
  maintenanceRecords: Record<string, unknown>[];
  date: string;
  report: Record<string, unknown> | null;
  review: Record<string, unknown> | null;
}): RetirementAssessment;
