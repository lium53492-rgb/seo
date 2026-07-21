import { isWorkbenchAuthorized } from "@/lib/seo/auth";
import { persistWorkbenchFeedback } from "@/lib/seo/feedback-store";

export async function POST(request: Request) {
  if (!isWorkbenchAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { message?: unknown };
    const result = await persistWorkbenchFeedback(String(body.message || ""));
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "反馈保存失败" },
      { status: 503 },
    );
  }
}
