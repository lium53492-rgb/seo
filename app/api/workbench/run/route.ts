import { isWorkbenchAuthorized } from "../../../../lib/seo/auth";
import { runDailySeoPipeline } from "../../../../lib/seo/pipeline";
import { persistReport } from "../../../../lib/seo/report-store";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isWorkbenchAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runDailySeoPipeline({ live: true });
    const storage = await persistReport(report);
    return Response.json({ ok: true, report, storage });
  } catch (error) {
    console.error("workbench_run_failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Pipeline failed" },
      { status: 500 },
    );
  }
}
