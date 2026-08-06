export const RENDERED_SURFACE_COPY_FIELDS: readonly [
  "eyebrow",
  "shortAnswerLabel",
  "contentsLabel",
  "sectionLabel",
  "faqEyebrow",
  "faqHeading",
  "relatedHeading",
  "finalCtaEyebrow",
  "finalCtaHeading",
  "finalCtaBody",
  "backToTop",
];

export function renderedCopyFragments(page: Record<string, any>): string[];
export function renderedBodyCopyFragments(page: Record<string, any>): string[];
export function visiblePageText(page: Record<string, any>): string;
export function servedContentPayload(page: Record<string, any>): Record<string, unknown>;
export function servedContentDigest(page: Record<string, any>): string;
