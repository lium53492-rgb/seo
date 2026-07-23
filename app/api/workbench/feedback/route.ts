import { isWorkbenchAuthorized } from "@/lib/seo/auth";
import { persistWorkbenchFeedback } from "@/lib/seo/feedback-store";

export async function POST(request: Request) {
  if (!isWorkbenchAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rawBody = await request.text();
    if (rawBody.length > 8_192) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    let body: { message?: unknown };
    try {
      body = JSON.parse(rawBody) as { message?: unknown };
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const result = await persistWorkbenchFeedback(String(body.message || ""));
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "反馈保存失败" },
      { status: 503 },
    );
  }
}
