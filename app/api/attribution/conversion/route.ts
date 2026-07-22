import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { logSeoGrowthEvent } from "@/lib/seo/attribution";

export const runtime = "nodejs";

const conversionEvent = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  clickId: z.string().uuid(),
  sourceSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  event: z.enum(["trial_started", "signup_completed", "purchase_completed"]),
  occurredAt: z.string().datetime(),
  revenueMinor: z.number().int().nonnegative().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
}).superRefine((value, context) => {
  if (value.event === "purchase_completed" && (value.revenueMinor === undefined || !value.currency)) {
    context.addIssue({ code: "custom", message: "Purchase events require revenueMinor and currency" });
  }
});

function authorized(header: string | null, secret: string) {
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const left = Buffer.from(provided);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const secret = process.env.ATTRIBUTION_SECRET;
  if (!secret) return Response.json({ error: "Attribution callback is not configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") || 0) > 16_384) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let parsed;
  try {
    parsed = conversionEvent.safeParse(await request.json());
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "Invalid conversion event", issues: parsed.error.issues }, { status: 400 });
  }

  const event = parsed.data;
  logSeoGrowthEvent(event.event, {
    clickId: event.clickId,
    currency: event.currency,
    eventId: event.eventId,
    eventOccurredAt: event.occurredAt,
    revenueMinor: event.revenueMinor,
    sourceSlug: event.sourceSlug,
  });

  const sinkUrl = process.env.ATTRIBUTION_SINK_URL;
  if (sinkUrl) {
    const sinkResponse = await fetch(sinkUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.ATTRIBUTION_SINK_TOKEN
          ? { authorization: `Bearer ${process.env.ATTRIBUTION_SINK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(event),
      cache: "no-store",
    });
    if (!sinkResponse.ok) {
      logSeoGrowthEvent("conversion_sink_failed", { eventId: event.eventId, status: sinkResponse.status });
      return Response.json({ error: "Conversion sink rejected the event" }, { status: 502 });
    }
  }

  return Response.json({ accepted: true, eventId: event.eventId }, { status: 202 });
}
