import { readLatestReport } from "../../../../lib/seo/report-store";
import { privateJson } from "../../../../lib/seo/private-response";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await readLatestReport();
    if (!report) {
      return privateJson({ error: "No verified local SEO report is available." }, { status: 404 });
    }
    return privateJson({
      ok: true,
      action: "read_only_report_health_check",
      reportId: report.id,
      mode: report.mode,
      generatedAt: report.generatedAt,
    });
  } catch (error) {
    return privateJson(
      { error: error instanceof Error ? error.message : "Report read failed" },
      { status: 500 },
    );
  }
}
