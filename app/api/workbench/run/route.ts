import { isWorkbenchAuthorized } from "../../../../lib/seo/auth";
import { privateJson } from "../../../../lib/seo/private-response";
import { readLatestReport } from "../../../../lib/seo/report-store";

export async function POST(request: Request) {
  // Refreshing only reads the latest verified report. Keep it usable on the
  // public workbench when no password has been configured.
  if (process.env.WORKBENCH_PASSWORD && !isWorkbenchAuthorized(request)) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await readLatestReport();
    if (!report) {
      return privateJson(
        { error: "尚无已验证日报；请等待本地免费研究自动化完成。" },
        { status: 404 },
      );
    }
    return privateJson({ ok: true, reportId: report.id, generatedAt: report.generatedAt });
  } catch (error) {
    return privateJson(
      { error: error instanceof Error ? error.message : "日报读取失败" },
      { status: 500 },
    );
  }
}
