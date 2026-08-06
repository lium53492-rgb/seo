export function publishedArchitectureHistoryFromReports(reports) {
  const history = [];
  for (const report of Array.isArray(reports) ? reports : []) {
    if (report?.publication?.status !== "published" || !report?.draft?.architecture ||
      !report?.draft?.signatureModule) continue;
    const slug = String(report.publication.slug || report.draft.slug || "").replace(/^\//, "");
    const timestamps = [
      report.publication.updatedAt,
      report.draft.generatedAt,
      report.generatedAt,
      report.publication.publishedAt,
    ]
      .map((value) => String(value || ""))
      .filter((value) => Number.isFinite(Date.parse(value)));
    const effectiveAt = timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0] || "";
    if (!slug || !Number.isFinite(Date.parse(effectiveAt))) continue;
    history.push({
      slug,
      sourceReportId: String(report.id || ""),
      effectiveAt,
      pagePattern: report.contentStrategy?.pagePattern || null,
      architecture: report.draft.architecture,
      signatureModule: report.draft.signatureModule,
    });
  }
  return history;
}
