import { isWorkbenchAuthorized } from "@/lib/seo/auth";
import {
  FeedbackConflictError,
  FeedbackInputError,
  FeedbackNotFoundError,
  listUnconsumedFeedback,
  markFeedbackConsumed,
  persistWorkbenchFeedback,
} from "@/lib/seo/feedback-store";
import { privateJson } from "@/lib/seo/private-response";
import { readLatestReport } from "@/lib/seo/report-store";

export async function GET(request: Request) {
  if (!isWorkbenchAuthorized(request)) {
    return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const queue = await listUnconsumedFeedback();
    return privateJson({ ok: true, queue });
  } catch (error) {
    return privateJson(
      {
        ok: false,
        error: error instanceof Error ? error.message : "反馈队列读取失败",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!isWorkbenchAuthorized(request)) {
    return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rawBody = await request.text();
    if (rawBody.length > 8_192) {
      return privateJson(
        { ok: false, error: "Payload too large" },
        { status: 413 },
      );
    }
    let body: { message?: unknown };
    try {
      body = JSON.parse(rawBody) as { message?: unknown };
    } catch {
      return privateJson(
        { ok: false, error: "Invalid JSON" },
        { status: 400 },
      );
    }
    if (typeof body.message !== "string") {
      return privateJson(
        { ok: false, error: "反馈内容必须是文本。" },
        { status: 400 },
      );
    }
    const result = await persistWorkbenchFeedback(body.message);
    return privateJson({ ok: true, ...result });
  } catch (error) {
    const status =
      error instanceof FeedbackInputError ? 400 :
      error instanceof FeedbackNotFoundError ? 404 :
      error instanceof FeedbackConflictError ? 409 :
      503;
    return privateJson(
      {
        ok: false,
        error: error instanceof Error ? error.message : "反馈保存失败",
      },
      { status },
    );
  }
}

export async function PATCH(request: Request) {
  if (!isWorkbenchAuthorized(request)) {
    return privateJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rawBody = await request.text();
    if (rawBody.length > 8_192) {
      return privateJson({ ok: false, error: "Payload too large" }, { status: 413 });
    }
    let body: {
      id?: unknown;
      date?: unknown;
      reportId?: unknown;
      decision?: unknown;
      rationale?: unknown;
    };
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      return privateJson({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }
    if (
      typeof body.id !== "string" ||
      typeof body.date !== "string" ||
      typeof body.reportId !== "string" ||
      (body.decision !== "adopted" && body.decision !== "rejected") ||
      typeof body.rationale !== "string"
    ) {
      return privateJson(
        { ok: false, error: "id、date、reportId、decision 与 rationale 均为必填字段。" },
        { status: 400 },
      );
    }
    const [queue, report] = await Promise.all([
      listUnconsumedFeedback(),
      readLatestReport(),
    ]);
    const pendingEntry = queue.entries.find((entry) =>
      entry.id === body.id && entry.date === body.date
    );
    const recordedDecision = report?.feedbackDecisions?.find((item) =>
      item.id === body.id && item.date === body.date
    );
    if (
      !pendingEntry ||
      !report ||
      report.id !== body.reportId ||
      !recordedDecision ||
      recordedDecision.message !== pendingEntry.message ||
      recordedDecision.decision !== body.decision ||
      recordedDecision.rationale !== body.rationale
    ) {
      throw new FeedbackConflictError(
        "反馈只能在最新 builder-backed 日报逐字记录相同决定与理由后标记为已消费。",
      );
    }
    const result = await markFeedbackConsumed({
      id: body.id,
      date: body.date,
      decision: body.decision,
      rationale: body.rationale,
    });
    return privateJson({ ok: true, ...result });
  } catch (error) {
    const status =
      error instanceof FeedbackInputError ? 400 :
      error instanceof FeedbackNotFoundError ? 404 :
      error instanceof FeedbackConflictError ? 409 :
      503;
    return privateJson(
      {
        ok: false,
        error: error instanceof Error ? error.message : "反馈消费状态保存失败",
      },
      { status },
    );
  }
}
