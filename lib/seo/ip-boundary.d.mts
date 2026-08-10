export type OriginalIpBoundary = {
  schemaVersion: 1;
  contentBasis: "original_tabletop_fantasy";
  dndReferenceScope: "audience_reference_only";
  srdMaterialUsed: false;
  thirdPartyNames: [];
};

export function originalIpBoundaryBlockers(input: {
  policy: Record<string, unknown>;
  reportDate: string | undefined;
  draftSchemaVersion: number | undefined;
  ipBoundary: unknown;
  visibleText: string;
}): string[];

export function assertOriginalIpBoundary(input: {
  policy: Record<string, unknown>;
  reportDate: string | undefined;
  draftSchemaVersion: number | undefined;
  ipBoundary: unknown;
  visibleText: string;
}): void;
