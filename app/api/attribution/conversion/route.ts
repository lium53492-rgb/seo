import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { logSeoGrowthEvent } from "@/lib/seo/attribution";
import { recordConversionEvent } from "@/lib/seo/attribution-store";
import { readPublishedPage } from "@/lib/seo/page-store";
import { privateJson } from "@/lib/seo/private-response";

export const runtime = "nodejs";

const conversionEvent = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  clickId: z.string().uuid(),
  sourceSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  event: z.enum(["trial_started", "signup_completed", "purchase_completed"]),
  occurredAt: z.string().datetime(),
  revenueMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
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
  if (!secret) return privateJson({ error: "Attribution callback is not configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") || 0) > 16_384) {
    return privateJson({ error: "Payload too large" }, { status: 413 });
  }

  let parsed;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 16_384) {
      return privateJson({ error: "Payload too large" }, { status: 413 });
    }
    parsed = conversionEvent.safeParse(JSON.parse(rawBody));
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return privateJson({ error: "Invalid conversion event", issues: parsed.error.issues }, { status: 400 });
  }

  const event = parsed.data;
  if (!await readPublishedPage(event.sourceSlug)) {
    return privateJson({ error: "Unknown SEO source slug" }, { status: 404 });
  }
  let internalPersistence: Awaited<ReturnType<typeof recordConversionEvent>> | null = null;
  let internalError: string | null = null;
  try {
    internalPersistence = await recordConversionEvent(event);
  } catch (error) {
    internalError = error instanceof Error ? error.message : "attribution_store_failed";
    if (/does not match|already bound/.test(internalError)) {
      return privateJson({ error: internalError }, { status: 409 });
    }
    logSeoGrowthEvent("conversion_store_failed", { eventId: event.eventId, reason: internalError });
  }

  const sinkUrl = process.env.ATTRIBUTION_SINK_URL;
  let externalPersistence = false;
  if (sinkUrl) {
    let sinkResponse: Response;
    try {
      sinkResponse = await fetch(sinkUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": event.eventId,
          ...(process.env.ATTRIBUTION_SINK_TOKEN
            ? { authorization: `Bearer ${process.env.ATTRIBUTION_SINK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(event),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      logSeoGrowthEvent("conversion_sink_failed", {
        eventId: event.eventId,
        reason: error instanceof Error ? error.name : "request_failed",
      });
      return privateJson({ error: "Conversion sink is unavailable" }, { status: 502 });
    }
    if (!sinkResponse.ok) {
      logSeoGrowthEvent("conversion_sink_failed", { eventId: event.eventId, status: sinkResponse.status });
      return privateJson({ error: "Conversion sink rejected the event" }, { status: 502 });
    }
    externalPersistence = true;
  }

  const storedInternally = internalPersistence?.state === "stored" || internalPersistence?.state === "duplicate";
  if (!storedInternally && !externalPersistence) {
    return privateJson({
      error: internalError || internalPersistence?.detail || "No durable attribution store is configured",
    }, { status: internalError ? 502 : 503 });
  }

  logSeoGrowthEvent(event.event, {
    clickId: event.clickId,
    currency: event.currency,
    eventId: event.eventId,
    eventOccurredAt: event.occurredAt,
    externalPersistence,
    internalPersistence: internalPersistence?.state ?? "failed",
    orphan: internalPersistence?.orphan ?? false,
    revenueMinor: event.revenueMinor,
    sourceSlug: event.sourceSlug,
  });

  return privateJson({
    accepted: true,
    duplicate: internalPersistence?.state === "duplicate",
    eventId: event.eventId,
    persistence: storedInternally && externalPersistence
      ? "internal_and_external"
      : storedInternally ? "internal" : "external",
  }, { status: 202 });
}
