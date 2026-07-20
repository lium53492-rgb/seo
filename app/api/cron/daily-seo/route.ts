import { runDailySeoPipeline } from "../../../../lib/seo/pipeline";
import { persistReport } from "../../../../lib/seo/report-store";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runDailySeoPipeline({ live: true });
    const storage = await persistReport(report);
    console.log(
      JSON.stringify({
        event: "daily_seo_pipeline_complete",
        reportId: report.id,
        mode: report.mode,
        topKeyword: report.opportunities[0]?.keyword,
        persisted: storage.persisted,
      }),
    );
    return Response.json({ ok: true, reportId: report.id, mode: report.mode, storage });
  } catch (error) {
    console.error("daily_seo_pipeline_failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Pipeline failed" },
      { status: 500 },
    );
  }
}
