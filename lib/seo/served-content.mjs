import { createHash } from "node:crypto";

export const RENDERED_SURFACE_COPY_FIELDS = Object.freeze([
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
]);

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function renderedSurfaceCopy(surfaceCopy) {
  return Object.fromEntries(
    RENDERED_SURFACE_COPY_FIELDS.map((field) => [field, stringValue(surfaceCopy?.[field])]),
  );
}

/**
 * The one canonical inventory of page-owned copy emitted by the schema-3
 * renderer. Product-claim, depth, and novelty gates all consume this list so
 * a new visible field cannot bypass review by living only in architecture.
 */
export function renderedBodyCopyFragments(page) {
  const architecture = page?.architecture;
  const sectionPlans = Array.isArray(architecture?.content?.sections)
    ? architecture.content.sections
    : [];
  const signature = page?.signatureModule;
  const internalLinks = Array.isArray(page?.internalLinks) ? page.internalLinks : [];
  const pagePath = stringValue(page?.path) || `/${stringValue(page?.slug).replace(/^\//, "")}`;
  const renderedRelatedLinks = [];
  const renderedHrefs = new Set();
  for (const link of internalLinks) {
    if (link?.href === "/" || link?.href === pagePath || renderedHrefs.has(link?.href)) continue;
    renderedHrefs.add(link?.href);
    renderedRelatedLinks.push(link);
  }
  return [
    page?.h1,
    page?.heroMarkdown,
    page?.primaryCta,
    architecture?.intent?.oneSentenceAnswer,
    architecture?.content?.thesis,
    architecture?.content?.signature?.readerAction,
    ...RENDERED_SURFACE_COPY_FIELDS
      .filter((field) => field !== "relatedHeading" || renderedRelatedLinks.length > 0)
      .map((field) => architecture?.presentation?.surfaceCopy?.[field]),
    ...(Array.isArray(page?.sections)
      ? page.sections.flatMap((section, index) => [
          sectionPlans[index]?.readerQuestion,
          section?.heading,
          section?.bodyMarkdown,
        ])
      : []),
    ...(Array.isArray(page?.faqs)
      ? page.faqs.flatMap((faq) => [faq?.question, faq?.answerMarkdown])
      : []),
    ...(signature && typeof signature === "object"
      ? [
          signature.title,
          signature.intro,
          ...(Array.isArray(signature.items)
            ? signature.items.flatMap((item) => [item?.label, item?.title, item?.bodyMarkdown])
            : []),
        ]
      : []),
    ...renderedRelatedLinks.map((link) => link?.anchor),
  ].filter((item) => typeof item === "string" && item.trim().length > 0);
}

export function renderedCopyFragments(page) {
  return [page?.title, page?.metaDescription, ...renderedBodyCopyFragments(page)]
    .filter((item) => typeof item === "string" && item.trim().length > 0);
}

export function visiblePageText(page) {
  return renderedCopyFragments(page).join(" ");
}

/**
 * Canonical runtime payload. It deliberately excludes quality/audit records,
 * timestamps, and digests; those describe the release but are not served copy.
 */
export function servedContentPayload(page) {
  const architecture = page?.architecture;
  return {
    schemaVersion: page?.schemaVersion,
    slug: stringValue(page?.slug).replace(/^\//, ""),
    path: stringValue(page?.path),
    pagePattern: stringValue(page?.pagePattern),
    title: stringValue(page?.title),
    metaDescription: stringValue(page?.metaDescription),
    h1: stringValue(page?.h1),
    heroMarkdown: stringValue(page?.heroMarkdown),
    primaryCta: stringValue(page?.primaryCta),
    sections: Array.isArray(page?.sections)
      ? page.sections.map((section) => ({
          id: stringValue(section?.id),
          role: stringValue(section?.role),
          format: stringValue(section?.format),
          heading: stringValue(section?.heading),
          bodyMarkdown: stringValue(section?.bodyMarkdown),
        }))
      : [],
    faqs: Array.isArray(page?.faqs)
      ? page.faqs.map((faq) => ({
          id: stringValue(faq?.id),
          job: stringValue(faq?.job),
          question: stringValue(faq?.question),
          answerMarkdown: stringValue(faq?.answerMarkdown),
        }))
      : [],
    architecture: architecture && typeof architecture === "object"
      ? {
          schemaVersion: architecture.schemaVersion,
          intent: architecture.intent,
          content: architecture.content,
          differentiation: architecture.differentiation,
          presentation: {
            ...architecture.presentation,
            surfaceCopy: renderedSurfaceCopy(architecture.presentation?.surfaceCopy),
          },
        }
      : null,
    signatureModule: page?.signatureModule ?? null,
    internalLinks: Array.isArray(page?.internalLinks)
      ? page.internalLinks.map((link) => ({
          anchor: stringValue(link?.anchor),
          href: stringValue(link?.href),
        }))
      : [],
  };
}

export function servedContentDigest(page) {
  return createHash("sha256")
    .update(JSON.stringify(servedContentPayload(page)))
    .digest("hex");
}
