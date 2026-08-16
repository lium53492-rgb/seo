type LegacyReleaseEntry = {
  slug?: unknown;
  schemaVersion?: unknown;
  publishedAt?: unknown;
  generatedFromReport?: unknown;
  draftDigest?: unknown;
};

type LegacyOutboundPolicy = {
  contentArchitecture?: {
    legacyPageSchemas?: unknown;
  };
  legacyPageGrandfathering?: {
    allowlist?: unknown;
  };
};

type LegacyOutboundPage = {
  slug?: unknown;
  schemaVersion?: unknown;
  publishedAt?: unknown;
  generatedFromReport?: unknown;
  draftDigest?: unknown;
};

/**
 * The retired NovelAI destination is a release-identity compatibility lane,
 * never a fallback outbound route for current Playworlds pages.
 */
export function isLegacyNovelAiOutboundEligible(
  page: LegacyOutboundPage | null | undefined,
  policy: LegacyOutboundPolicy,
) {
  if (!page || typeof page.slug !== "string") return false;
  const legacySchemas = Array.isArray(policy.contentArchitecture?.legacyPageSchemas)
    ? new Set(policy.contentArchitecture.legacyPageSchemas)
    : new Set();
  const allowlist = Array.isArray(policy.legacyPageGrandfathering?.allowlist)
    ? policy.legacyPageGrandfathering.allowlist as LegacyReleaseEntry[]
    : [];
  const release = allowlist.find((entry) => entry?.slug === page.slug);

  return Boolean(
    release &&
    legacySchemas.has(page.schemaVersion) &&
    page.schemaVersion === release.schemaVersion &&
    page.publishedAt === release.publishedAt &&
    page.generatedFromReport === release.generatedFromReport &&
    page.draftDigest === release.draftDigest
  );
}

export async function resolveLegacyNovelAiSource<T extends LegacyOutboundPage>(
  slug: string,
  readPage: (slug: string) => Promise<T | null>,
  policy: LegacyOutboundPolicy,
) {
  const page = await readPage(slug);
  return isLegacyNovelAiOutboundEligible(page, policy) ? page : null;
}
