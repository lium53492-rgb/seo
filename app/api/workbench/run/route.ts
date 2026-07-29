import { isWorkbenchAuthorized } from "../../../../lib/seo/auth";
import { readDailyPipelineStatus } from "../../../../lib/seo/pipeline-status";
import { privateJson } from "../../../../lib/seo/private-response";
import { readLatestReport } from "../../../../lib/seo/report-store";

export async function POST(request: Request) {
  // This endpoint is intentionally read-only. Daily research runs in the
  // local Codex automation where browser access and repository safeguards are
  // available; the workbench reports its observable state without pretending
  // to start a production job inside a serverless request.
  if (process.env.WORKBENCH_PASSWORD && !isWorkbenchAuthorized(request)) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [report, pipeline] = await Promise.all([
      readLatestReport(),
      readDailyPipelineStatus(),
    ]);
    return privateJson({
      ok: true,
      action: "read_only_pipeline_status",
      pipeline,
      latestReport: report
        ? { reportId: report.id, date: report.date, generatedAt: report.generatedAt }
        : null,
    });
  } catch (error) {
    return privateJson(
      { error: error instanceof Error ? error.message : "流程状态读取失败" },
      { status: 500 },
    );
  }
}
