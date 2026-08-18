import { z } from "zod";
import playworldsCallback from "@/data/config/playworlds-callback.json";
import { logSeoGrowthEvent } from "@/lib/seo/attribution";
import { recordPlayworldsConversionEvent } from "@/lib/seo/attribution-store";
import {
  isPlayworldsCallbackJson,
  readBoundedPlayworldsCallbackBody,
  verifyPlayworldsCallbackSignature,
} from "@/lib/seo/playworlds-callback";
import { privateJson } from "@/lib/seo/private-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const conversionEvent = z.object({
  schemaVersion: z.literal(1),
  producer: z.literal("playworlds"),
  product: z.literal("playworlds"),
  eventId: z.string().uuid(),
  clickId: z.string().uuid(),
  sourceSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  event: z.enum(playworldsCallback.events as [
    "trial_started",
    "signup_completed",
    "purchase_completed",
  ]),
  occurredAt: z.string().datetime({ offset: true }),
  revenueMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
}).strict().superRefine((value, context) => {
  const isPurchase = value.event === "purchase_completed";
  if (isPurchase && (value.revenueMinor === undefined || !value.currency)) {
    context.addIssue({
      code: "custom",
      message: "Purchase events require revenueMinor and currency",
    });
  }
  if (!isPurchase && (value.revenueMinor !== undefined || value.currency !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "Only purchase events may include revenueMinor and currency",
    });
  }
});

export async function POST(request: Request) {
  if (!isPlayworldsCallbackJson(request)) {
    return privateJson({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const body = await readBoundedPlayworldsCallbackBody(request);
  if (!body.ok) return privateJson({ error: body.error }, { status: body.status });

  const verification = verifyPlayworldsCallbackSignature({
    headers: request.headers,
    rawBody: body.rawBody,
  });
  if (!verification.ok) {
    return privateJson({ error: verification.error }, { status: verification.status });
  }

  let parsed;
  try {
    parsed = conversionEvent.safeParse(JSON.parse(body.rawBody));
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return privateJson({ error: "Invalid Playworlds conversion event", issues: parsed.error.issues }, { status: 400 });
  }
  if (verification.deliveryId.toLowerCase() !== parsed.data.eventId.toLowerCase()) {
    return privateJson({ error: "Delivery ID must match eventId" }, { status: 400 });
  }

  const occurredAtMs = Date.parse(parsed.data.occurredAt);
  const nowMs = Date.now();
  if (
    occurredAtMs > nowMs + playworldsCallback.signature.maximumClockSkewSeconds * 1_000 ||
    occurredAtMs < nowMs - playworldsCallback.maximumEventAgeDays * 86_400_000
  ) {
    return privateJson({ error: "Conversion event timestamp is outside the accepted window" }, { status: 400 });
  }

  const normalizedEventId = parsed.data.eventId.toLowerCase();
  const normalizedClickId = parsed.data.clickId.toLowerCase();
  let result;
  try {
    result = await recordPlayworldsConversionEvent({
      ...parsed.data,
      eventId: normalizedEventId,
      clickId: normalizedClickId,
      occurredAt: new Date(occurredAtMs).toISOString(),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "playworlds_attribution_store_failed";
    if (/does not match|cannot join|already bound/.test(detail)) {
      return privateJson({ error: detail }, { status: 409 });
    }
    logSeoGrowthEvent("playworlds_conversion_store_failed", {
      eventId: normalizedEventId,
      reason: detail,
      sourceSlug: parsed.data.sourceSlug,
    });
    return privateJson({ error: "Playworlds attribution store is unavailable" }, { status: 502 });
  }
  if (result.state === "unavailable") {
    return privateJson({ error: result.detail }, { status: 503 });
  }

  logSeoGrowthEvent(`playworlds_${parsed.data.event}`, {
    duplicate: result.state === "duplicate",
    eventId: normalizedEventId,
    orphan: result.state === "duplicate" ? null : result.orphan ?? false,
    sourceSlug: parsed.data.sourceSlug,
  });
  return privateJson({
    accepted: true,
    duplicate: result.state === "duplicate",
    eventId: normalizedEventId,
    joined: result.orphan === true ? false : result.state === "stored" ? true : null,
    orphan: result.state === "duplicate" ? null : result.orphan ?? false,
    persistence: "internal",
  }, { status: 202 });
}
