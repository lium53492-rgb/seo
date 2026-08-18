import { z } from "zod";
import playworldsCallback from "@/data/config/playworlds-callback.json";
import { recordPlayworldsIntegrationProbe } from "@/lib/seo/attribution-store";
import {
  isPlayworldsCallbackJson,
  readBoundedPlayworldsCallbackBody,
  verifyPlayworldsCallbackSignature,
} from "@/lib/seo/playworlds-callback";
import { privateJson } from "@/lib/seo/private-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handshake = z.object({
  schemaVersion: z.literal(1),
  probeId: z.string().uuid(),
  producer: z.literal("playworlds"),
  product: z.literal("playworlds"),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();

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
    parsed = handshake.safeParse(JSON.parse(body.rawBody));
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return privateJson({ error: "Invalid Playworlds handshake", issues: parsed.error.issues }, { status: 400 });
  }
  if (verification.deliveryId.toLowerCase() !== parsed.data.probeId.toLowerCase()) {
    return privateJson({ error: "Delivery ID must match probeId" }, { status: 400 });
  }

  const occurredAtMs = Date.parse(parsed.data.occurredAt);
  if (
    Math.abs(verification.timestampMs - occurredAtMs) >
    playworldsCallback.signature.maximumClockSkewSeconds * 1_000
  ) {
    return privateJson({ error: "Handshake timestamp does not match its signed delivery timestamp" }, { status: 400 });
  }

  let result;
  try {
    result = await recordPlayworldsIntegrationProbe({
      ...parsed.data,
      probeId: parsed.data.probeId.toLowerCase(),
      occurredAt: new Date(occurredAtMs).toISOString(),
    });
  } catch {
    return privateJson({ error: "Playworlds handshake store is unavailable" }, { status: 502 });
  }
  if (result.state !== "stored") {
    return privateJson({ error: result.detail }, { status: 503 });
  }
  return privateJson({
    accepted: true,
    probeId: parsed.data.probeId.toLowerCase(),
    producer: "playworlds",
    product: "playworlds",
    detail: result.detail,
  }, { status: 202 });
}
