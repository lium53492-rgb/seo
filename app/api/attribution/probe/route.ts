import { z } from "zod";
import { isAttributionAuthorized } from "@/lib/seo/attribution";
import { recordNovelAiIntegrationProbe } from "@/lib/seo/attribution-store";
import { privateJson } from "@/lib/seo/private-response";

export const runtime = "nodejs";

const integrationProbe = z.object({
  schemaVersion: z.literal(1),
  probeId: z.string().uuid(),
  producer: z.literal("novelai"),
  occurredAt: z.string().datetime(),
});

export async function POST(request: Request) {
  const secret = process.env.ATTRIBUTION_SECRET;
  if (!secret) {
    return privateJson({ error: "Attribution callback is not configured" }, { status: 503 });
  }
  if (!isAttributionAuthorized(request.headers.get("authorization"), secret)) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") || 0) > 4_096) {
    return privateJson({ error: "Payload too large" }, { status: 413 });
  }

  let parsed;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 4_096) {
      return privateJson({ error: "Payload too large" }, { status: 413 });
    }
    parsed = integrationProbe.safeParse(JSON.parse(rawBody));
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return privateJson({ error: "Invalid integration probe", issues: parsed.error.issues }, { status: 400 });
  }

  const ageMs = Math.abs(Date.now() - Date.parse(parsed.data.occurredAt));
  if (ageMs > 15 * 60 * 1_000) {
    return privateJson({ error: "Integration probe timestamp is stale" }, { status: 400 });
  }
  let result;
  try {
    result = await recordNovelAiIntegrationProbe(parsed.data);
  } catch {
    return privateJson({ error: "Attribution probe store is unavailable" }, { status: 502 });
  }
  if (result.state !== "stored") {
    return privateJson({ error: result.detail }, { status: 503 });
  }
  return privateJson({
    accepted: true,
    probeId: parsed.data.probeId,
    detail: result.detail,
  }, { status: 202 });
}
