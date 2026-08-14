import { NextResponse } from "next/server";
import { recordLandingCoverageCheckpoint } from "@/lib/seo/attribution-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ phase: string }> },
) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const { phase } = await context.params;
  if (phase !== "start" && phase !== "end" && phase !== "rollover") {
    return NextResponse.json({ error: "Unknown coverage phase" }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  try {
    const occurredAt = new Date().toISOString();
    const results = phase === "rollover"
      ? await Promise.all([
          recordLandingCoverageCheckpoint({ phase: "end", occurredAt }),
          recordLandingCoverageCheckpoint({ phase: "start", occurredAt }),
        ])
      : [await recordLandingCoverageCheckpoint({ phase, occurredAt })];
    const stored = results.every((result) => result.state === "stored");
    return NextResponse.json({
      ok: stored,
      state: stored ? "stored" : "unavailable",
      phase,
      checkpoints: results.map((result) => ({
        phase: result.phase,
        day: result.day,
        state: result.state,
      })),
    }, {
      status: stored ? 200 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Coverage checkpoint failed" }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
