import { isWorkbenchAuthorized } from "../../../../lib/seo/auth";
import {
  PipelinePrerequisiteError,
  runDailySeoPipeline,
} from "../../../../lib/seo/pipeline";
import { persistReport } from "../../../../lib/seo/report-store";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isWorkbenchAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runDailySeoPipeline({
      live: true,
      generateContent: true,
      strict: true,
    });
    const storage = await persistReport(report);
    return Response.json({ ok: true, report, storage });
  } catch (error) {
    console.error("workbench_run_failed", error);
    if (error instanceof PipelinePrerequisiteError) {
      return Response.json(
        { error: error.message, issues: error.issues },
        { status: 424 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Pipeline failed" },
      { status: 500 },
    );
  }
}
