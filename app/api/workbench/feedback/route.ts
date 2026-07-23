import { isWorkbenchAuthorized } from "@/lib/seo/auth";
import { persistWorkbenchFeedback } from "@/lib/seo/feedback-store";
import { privateJson } from "@/lib/seo/private-response";

export async function POST(request: Request) {
  if (!isWorkbenchAuthorized(request)) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rawBody = await request.text();
    if (rawBody.length > 8_192) {
      return privateJson({ error: "Payload too large" }, { status: 413 });
    }
    let body: { message?: unknown };
    try {
      body = JSON.parse(rawBody) as { message?: unknown };
    } catch {
      return privateJson({ error: "Invalid JSON" }, { status: 400 });
    }
    const result = await persistWorkbenchFeedback(String(body.message || ""));
    return privateJson({ ok: true, ...result });
  } catch (error) {
    return privateJson(
      { error: error instanceof Error ? error.message : "反馈保存失败" },
      { status: 503 },
    );
  }
}
