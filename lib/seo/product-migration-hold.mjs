import { servedContentDigest } from "./served-content.mjs";

const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateProductMigrationHoldPolicy(policy) {
  const rawHolds = Array.isArray(policy?.productMigrationHoldSlugs)
    ? policy.productMigrationHoldSlugs
    : [];
  const holdSlugs = rawHolds.map((slug) => String(slug));
  const retiredSlugs = new Set(Array.isArray(policy?.retiredPageSlugs)
    ? policy.retiredPageSlugs.map(String)
    : []);
  const allowlist = Array.isArray(policy?.legacyPageGrandfathering?.allowlist)
    ? policy.legacyPageGrandfathering.allowlist
    : [];
  const allowlistBySlug = new Map(allowlist.map((entry) => [entry?.slug, entry]));

  if (
    new Set(holdSlugs).size !== holdSlugs.length ||
    holdSlugs.some((slug) => !safeSlug.test(slug) || retiredSlugs.has(slug)) ||
    allowlistBySlug.size !== allowlist.length ||
    holdSlugs.some((slug) => !allowlistBySlug.has(slug))
  ) {
    throw new Error(
      "Product-migration holds must be unique safe slugs, separate from retired pages, and bound to the legacy allowlist",
    );
  }

  return { holdSlugs, allowlistBySlug };
}

export function assertPreservedProductMigrationHolds(policy, pageArtifacts) {
  const { holdSlugs, allowlistBySlug } = validateProductMigrationHoldPolicy(policy);
  const pages = Array.isArray(pageArtifacts) ? pageArtifacts : [];

  for (const slug of holdSlugs) {
    const matches = pages.filter((page) => page?.slug === slug);
    if (matches.length !== 1) {
      throw new Error(
        `Product-migration hold /${slug} must retain exactly one historical page artifact; found ${matches.length}`,
      );
    }
    const page = matches[0];
    const release = allowlistBySlug.get(slug);
    const identityMatches =
      page.status === "published" &&
      page.schemaVersion === release.schemaVersion &&
      page.publishedAt === release.publishedAt &&
      page.generatedFromReport === release.generatedFromReport &&
      page.draftDigest === release.draftDigest;
    if (!identityMatches || servedContentDigest(page) !== release.servedContentDigest) {
      throw new Error(
        `Product-migration hold /${slug} no longer matches its reviewed historical release identity and served-content digest`,
      );
    }
  }

  return holdSlugs;
}
