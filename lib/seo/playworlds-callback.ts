import { createHmac, timingSafeEqual } from "node:crypto";
import playworldsCallback from "../../data/config/playworlds-callback.json" with { type: "json" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unixTimestamp = /^\d{10}$/;
const versionedSignature = /^v1=([0-9a-f]{64})$/;

export const playworldsCallbackContract = Object.freeze({
  ...playworldsCallback,
  events: Object.freeze([...playworldsCallback.events]),
  paths: Object.freeze({ ...playworldsCallback.paths }),
  signature: Object.freeze({ ...playworldsCallback.signature }),
});

export type PlayworldsCallbackVerification =
  | {
      ok: true;
      deliveryId: string;
      timestamp: string;
      timestampMs: number;
    }
  | {
      ok: false;
      status: 401 | 503;
      error: string;
    };

export function playworldsCallbackReceiverStatus(secret = process.env.PLAYWORLDS_CALLBACK_SECRET) {
  if (!secret) {
    return {
      configured: false,
      provider: "playworlds_callback" as const,
      detail: "PLAYWORLDS_CALLBACK_SECRET is not configured.",
    };
  }
  if (Buffer.byteLength(secret, "utf8") < playworldsCallback.signature.minimumSecretBytes) {
    return {
      configured: false,
      provider: "playworlds_callback" as const,
      detail: `PLAYWORLDS_CALLBACK_SECRET must contain at least ${playworldsCallback.signature.minimumSecretBytes} bytes.`,
    };
  }
  return {
    configured: true,
    provider: "playworlds_callback" as const,
    detail: "The Playworlds signed callback receiver secret is configured.",
  };
}

export function evaluatePlayworldsAttributionJoin(input: {
  blockOnOrphanCallbacks: boolean;
  orphanCallbacks: number | null;
}) {
  const checked = Number.isInteger(input.orphanCallbacks) && Number(input.orphanCallbacks) >= 0;
  const blocked = input.blockOnOrphanCallbacks && checked && Number(input.orphanCallbacks) > 0;
  const ready = !input.blockOnOrphanCallbacks || (checked && !blocked);
  return {
    checked,
    blocked,
    ready,
    orphanCallbacks: checked ? Number(input.orphanCallbacks) : null,
  };
}

export function evaluatePlayworldsFullLoopReadiness(input: {
  sourceProbeReady: boolean;
  conversionCallbackConfigured: boolean;
  callbackHandshakeRecent: boolean;
  attributionJoinReady: boolean;
}) {
  return Boolean(
    input.sourceProbeReady &&
    input.conversionCallbackConfigured &&
    input.callbackHandshakeRecent &&
    input.attributionJoinReady
  );
}

function signingPayload(timestamp: string, deliveryId: string, rawBody: string) {
  return `${playworldsCallback.signature.version}\n${timestamp}\n${deliveryId}\n${rawBody}`;
}

export function createPlayworldsCallbackSignature(input: {
  secret: string;
  timestamp: string;
  deliveryId: string;
  rawBody: string;
}) {
  const status = playworldsCallbackReceiverStatus(input.secret);
  if (!status.configured) throw new Error(status.detail);
  if (!unixTimestamp.test(input.timestamp)) {
    throw new Error("Playworlds callback timestamp must be Unix seconds");
  }
  if (!uuid.test(input.deliveryId)) {
    throw new Error("Playworlds callback delivery ID must be a UUID");
  }
  const digest = createHmac("sha256", input.secret)
    .update(signingPayload(input.timestamp, input.deliveryId, input.rawBody), "utf8")
    .digest("hex");
  return `${playworldsCallback.signature.version}=${digest}`;
}

export function createPlayworldsCallbackHeaders(input: {
  secret: string;
  timestamp: string;
  deliveryId: string;
  rawBody: string;
}) {
  return {
    "content-type": "application/json",
    [playworldsCallback.signature.timestampHeader]: input.timestamp,
    [playworldsCallback.signature.deliveryIdHeader]: input.deliveryId,
    [playworldsCallback.signature.signatureHeader]: createPlayworldsCallbackSignature(input),
  };
}

export function verifyPlayworldsCallbackSignature(input: {
  headers: Headers;
  rawBody: string;
  secret?: string;
  nowMs?: number;
}): PlayworldsCallbackVerification {
  const secret = input.secret ?? process.env.PLAYWORLDS_CALLBACK_SECRET;
  const status = playworldsCallbackReceiverStatus(secret);
  if (!status.configured || !secret) {
    return { ok: false, status: 503, error: status.detail };
  }

  const timestamp = input.headers.get(playworldsCallback.signature.timestampHeader) ?? "";
  const deliveryId = input.headers.get(playworldsCallback.signature.deliveryIdHeader) ?? "";
  const signature = input.headers.get(playworldsCallback.signature.signatureHeader) ?? "";
  const parsedSignature = signature.match(versionedSignature);
  if (!unixTimestamp.test(timestamp) || !uuid.test(deliveryId) || !parsedSignature) {
    return { ok: false, status: 401, error: "Invalid Playworlds callback signature" };
  }

  const timestampMs = Number(timestamp) * 1_000;
  const nowMs = input.nowMs ?? Date.now();
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(nowMs - timestampMs) > playworldsCallback.signature.maximumClockSkewSeconds * 1_000
  ) {
    return { ok: false, status: 401, error: "Invalid Playworlds callback signature" };
  }

  const expected = createHmac("sha256", secret)
    .update(signingPayload(timestamp, deliveryId, input.rawBody), "utf8")
    .digest();
  const provided = Buffer.from(parsedSignature[1], "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Invalid Playworlds callback signature" };
  }
  return { ok: true, deliveryId, timestamp, timestampMs };
}

export async function readBoundedPlayworldsCallbackBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > playworldsCallback.maximumBodyBytes)) {
    return { ok: false as const, status: 413 as const, error: "Payload too large" };
  }
  if (!request.body) return { ok: true as const, rawBody: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > playworldsCallback.maximumBodyBytes) {
        await reader.cancel();
        return { ok: false as const, status: 413 as const, error: "Payload too large" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return {
        ok: true as const,
        rawBody: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      };
    } catch {
      return { ok: false as const, status: 400 as const, error: "Request body must be valid UTF-8" };
    }
  } finally {
    reader.releaseLock();
  }
}

export function isPlayworldsCallbackJson(request: Request) {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}
