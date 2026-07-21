import { isWorkbenchAuthorized } from "../../../../lib/seo/auth";
import { readLatestReport } from "../../../../lib/seo/report-store";

export async function POST(request: Request) {
  if (!isWorkbenchAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await readLatestReport();
    if (!report) {
      return Response.json(
        { error: "尚无已验证日报；请等待本地免费研究自动化完成。" },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, reportId: report.id, generatedAt: report.generatedAt });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "日报读取失败" },
      { status: 500 },
    );
  }
}
