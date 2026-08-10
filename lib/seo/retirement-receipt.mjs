const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function shanghaiDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function reportPublications(report) {
  const source = Array.isArray(report?.publications) && report.publications.length
    ? report.publications
    : report?.publication && typeof report.publication === "object"
      ? [report.publication]
      : [];
  return source.filter((publication) => publication?.status === "published");
}

function empty(state, reason = null, slugs = []) {
  return {
    state,
    slug: slugs[0] ?? null,
    slugs,
    retiredAt: null,
    retiredAts: [],
    receipt: null,
    receipts: [],
    reason,
  };
}

function validateReceipt({ record, receipt, date, report, review, publication }) {
  const slug = publication.slug.replace(/^\//, "");
  if (record?.schemaVersion !== 1 || receipt?.schemaVersion !== 1 ||
    receipt.action !== "retire_published_page") {
    return "The retirement receipt schema or action is invalid.";
  }
  if (!Array.isArray(record.retiredPages) || !record.retiredPages.includes(slug) ||
    typeof record.authorization !== "string" || record.authorization.trim().length < 20) {
    return "The retirement receipt is missing explicit authorization or its retired-page index.";
  }
  if (report?.date !== date || report?.id !== receipt.reportId) {
    return "The retirement receipt does not match the daily report.";
  }
  if (!Number.isFinite(Date.parse(receipt.publishedAt || "")) ||
    shanghaiDate(receipt.publishedAt) !== date ||
    receipt.publishedAt !== publication.publishedAt) {
    return "The retirement receipt does not match the original publication timestamp.";
  }
  if (!Number.isFinite(Date.parse(receipt.retiredAt || "")) ||
    Date.parse(receipt.retiredAt) < Date.parse(receipt.publishedAt)) {
    return "The retirement timestamp is invalid or predates publication.";
  }

  const reportDigest = publication.draftDigest ?? null;
  if (receipt.draftDigest !== reportDigest) {
    return "The retirement receipt digest does not match the published report.";
  }
  if (reportDigest !== null && (review?.decision !== "approved" ||
    review?.reportId !== report.id || review?.slug !== slug ||
    review?.draftDigest !== reportDigest)) {
    return "The retirement receipt does not match the approved review chain.";
  }
  return null;
}

export function assessPublicationRetirement({ maintenanceRecords, date, report, review }) {
  const publications = reportPublications(report);
  if (publications.length === 0) return empty("none");
  const slugs = publications.map((publication) =>
    typeof publication?.slug === "string" ? publication.slug.replace(/^\//, "") : "");
  if (slugs.some((slug) => !SAFE_SLUG.test(slug)) || new Set(slugs).size !== slugs.length) {
    return empty("invalid", "The report has an invalid or duplicate published-page list.", slugs.filter(Boolean));
  }

  const allCandidates = (Array.isArray(maintenanceRecords) ? maintenanceRecords : [])
    .flatMap((record) => (Array.isArray(record?.retiredPublications)
      ? record.retiredPublications
        .filter((receipt) => receipt?.originalPublicationDate === date && receipt?.reportId === report?.id)
        .map((receipt) => ({ record, receipt }))
      : []));

  if (allCandidates.length === 0) return empty("none");
  if (allCandidates.some(({ receipt }) => !slugs.includes(receipt?.slug))) {
    return empty("invalid", "The daily retirement record names a page outside the report publication list.", slugs);
  }

  const matched = [];
  for (const publication of publications) {
    const slug = publication.slug.replace(/^\//, "");
    const candidates = allCandidates.filter(({ receipt }) => receipt?.slug === slug);
    if (candidates.length !== 1) {
      return empty("invalid", candidates.length === 0
        ? `Published page /${slug} is missing its retirement receipt.`
        : `Published page /${slug} has more than one retirement receipt.`, slugs);
    }
    const error = validateReceipt({
      ...candidates[0],
      date,
      report,
      review,
      publication,
    });
    if (error) return empty("invalid", `${error} (/${slug})`, slugs);
    matched.push(candidates[0].receipt);
  }

  const retiredAts = matched.map((receipt) => receipt.retiredAt);
  return {
    state: "valid",
    slug: slugs[0],
    slugs,
    retiredAt: retiredAts[0],
    retiredAts,
    receipt: matched[0],
    receipts: matched,
    reason: null,
  };
}
