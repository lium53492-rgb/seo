import { createHash, createHmac } from "node:crypto";
import type { OutboundLocation } from "./attribution";
import playworldsAttribution from "../../data/config/playworlds-attribution.json" with { type: "json" };

const keyPrefix = "seo:v1:";
const retentionSeconds = 400 * 24 * 60 * 60;
const integrationProbeRetentionSeconds = 8 * 24 * 60 * 60;
const landingEventRetentionSeconds = 8 * 24 * 60 * 60;
const landingRateLimitWindowSeconds = 60;
const landingRateLimitRequestsPerWindow = 60;
const dayMilliseconds = 86_400_000;
const requestTimeoutMs = 2_500;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const visitorIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const landingViewScript = `
if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
local requests = redis.call("INCR", KEYS[4])
if requests == 1 then redis.call("EXPIRE", KEYS[4], ARGV[4]) end
if requests > tonumber(ARGV[5]) then return -1 end
redis.call("SET", KEYS[1], "1", "EX", ARGV[2])
redis.call("HINCRBY", KEYS[2], "pageviews", 1)
redis.call("EXPIRE", KEYS[2], ARGV[3])
redis.call("PFADD", KEYS[3], ARGV[1])
redis.call("EXPIRE", KEYS[3], ARGV[3])
return 1
`;

const landingCoverageScript = `
if ARGV[1] == "start" then
  redis.call("HSETNX", KEYS[1], "startAt", ARGV[2])
else
  redis.call("HSET", KEYS[1], "endAt", ARGV[2])
end
redis.call("HINCRBY", KEYS[1], "checkpointCount", 1)
redis.call("EXPIRE", KEYS[1], ARGV[3])
return 1
`;

const outboundScript = `
local existingSource = redis.call("HGET", KEYS[2], "sourceSlug")
local existingProduct = redis.call("HGET", KEYS[2], "product")
if existingSource and existingSource ~= ARGV[3] then return -2 end
if existingProduct and existingProduct ~= ARGV[9] then return -3 end
if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
redis.call("HSET", KEYS[2],
  "sourceSlug", ARGV[3],
  "keyword", ARGV[4],
  "location", ARGV[5],
  "occurredAt", ARGV[6],
  "cohortDay", ARGV[7],
  "qualified", ARGV[8],
  "product", ARGV[9])
redis.call("EXPIRE", KEYS[2], ARGV[2])
redis.call("HINCRBY", KEYS[3], "outboundRequests", 1)
redis.call("HINCRBY", KEYS[3], "cta:" .. ARGV[5], 1)
if ARGV[8] == "1" then
  redis.call("HINCRBY", KEYS[3], "qualifiedOutboundClicks", 1)
end
redis.call("EXPIRE", KEYS[3], ARGV[2])
return 1
`;

const conversionScript = `
local existingEvent = redis.call("GET", KEYS[1])
if existingEvent then
  if existingEvent == ARGV[1] then return 0 end
  return -4
end
local sourceSlug = redis.call("HGET", KEYS[2], "sourceSlug")
local cohortDay = redis.call("HGET", KEYS[2], "cohortDay")
local product = redis.call("HGET", KEYS[2], "product")
local orphan = 0
if sourceSlug then
  if sourceSlug ~= ARGV[3] then return -2 end
  if ARGV[10] == "playworlds" and product ~= "playworlds" then return -3 end
  if ARGV[10] ~= "playworlds" and product and product ~= ARGV[10] then return -3 end
else
  sourceSlug = ARGV[3]
  cohortDay = ARGV[6]
  orphan = 1
  redis.call("HSET", KEYS[2],
    "sourceSlug", sourceSlug,
    "cohortDay", cohortDay,
    "occurredAt", ARGV[5],
    "qualified", "1",
    "product", ARGV[10],
    "orphan", "1")
end
local cohortKey = ARGV[9] .. ARGV[10] .. ":" .. cohortDay .. ":" .. sourceSlug
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
local metricField = ""
if ARGV[4] == "trial_started" then metricField = "trialStarts" end
if ARGV[4] == "signup_completed" then metricField = "signups" end
if ARGV[4] == "purchase_completed" then metricField = "paidConversions" end
if redis.call("HSETNX", KEYS[2], "seen:" .. ARGV[4], ARGV[5]) == 1 then
  redis.call("HINCRBY", cohortKey, metricField, 1)
end
if redis.call("HGET", KEYS[2], "qualified") ~= "1" then
  redis.call("HSET", KEYS[2], "qualified", "1")
  redis.call("HINCRBY", cohortKey, "qualifiedOutboundClicks", 1)
end
if ARGV[4] == "purchase_completed" then
  redis.call("HINCRBY", cohortKey, "purchaseEvents", 1)
  redis.call("HINCRBY", cohortKey, "revenueMinor:" .. ARGV[8], ARGV[7])
end
redis.call("HINCRBY", KEYS[3], "acceptedCallbacks", 1)
redis.call("HSET", KEYS[3], "lastAcceptedAt", ARGV[5])
redis.call("HSETNX", KEYS[3], "orphanCallbacks", 0)
if orphan == 1 then
  redis.call("HINCRBY", cohortKey, "orphanCallbacks", 1)
  redis.call("HINCRBY", KEYS[3], "orphanCallbacks", 1)
end
redis.call("EXPIRE", KEYS[2], ARGV[2])
redis.call("EXPIRE", cohortKey, ARGV[2])
redis.call("EXPIRE", KEYS[3], ARGV[2])
if orphan == 1 then return 2 end
return 1
`;

export type AttributionConversionEvent = {
  schemaVersion: 1;
  eventId: string;
  clickId: string;
  sourceSlug: string;
  event: "trial_started" | "signup_completed" | "purchase_completed";
  occurredAt: string;
  revenueMinor?: number;
  currency?: string;
};

export type PlayworldsAttributionConversionEvent = AttributionConversionEvent & {
  producer: "playworlds";
  product: "playworlds";
};

export type AttributionWriteResult = {
  state: "stored" | "duplicate" | "unavailable";
  detail: string;
  orphan?: boolean;
};

export type LandingViewWriteResult = AttributionWriteResult | {
  state: "rate_limited";
  detail: string;
};

export type FirstPartyLandingAnalyticsStatus = {
  configured: boolean;
  provider: "first_party_upstash";
  startedAt?: string;
  firstCompleteShanghaiDayStart?: string;
  detail?: string;
};

export type FirstPartyLandingAnalyticsResult = {
  state: "observed" | "unavailable";
  visitors: number | null;
  pageviews: number | null;
  detail: string;
};

export type LandingCoverageCheckpointResult = {
  state: "stored" | "unavailable";
  day: string;
  phase: "start" | "end";
  detail: string;
};

export type AttributionAggregate = {
  state: "observed" | "unavailable";
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
  qualifiedOutboundClicks: number | null;
  outboundRequests: number | null;
  trialStarts: number | null;
  signups: number | null;
  paidConversions: number | null;
  purchaseEvents: number | null;
  orphanCallbacks: number | null;
  revenueByCurrency: Record<string, number>;
  ctaLocations: Record<string, number>;
  detail: string;
};

export type NovelAiIntegrationProbe = {
  schemaVersion: 1;
  probeId: string;
  producer: "novelai";
  occurredAt: string;
};

export type NovelAiIntegrationProbeStatus = {
  state: "observed" | "unavailable";
  lastObservedAt: string | null;
  probeId: string | null;
  detail: string;
};

export type PlayworldsIntegrationProbe = {
  schemaVersion: 1;
  probeId: string;
  producer: "playworlds";
  product: "playworlds";
  occurredAt: string;
};

export type PlayworldsIntegrationProbeStatus = {
  state: "observed" | "unavailable";
  lastObservedAt: string | null;
  probeId: string | null;
  detail: string;
};

export type PlayworldsCallbackHealth = {
  state: "observed" | "unavailable";
  acceptedCallbacks: number | null;
  orphanCallbacks: number | null;
  lastAcceptedAt: string | null;
  detail: string;
};

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function attributionStoreStatus() {
  return redisConfig()
    ? { configured: true, provider: "upstash_redis" as const }
    : {
        configured: false,
        provider: "upstash_redis" as const,
        detail: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not configured.",
      };
}

function firstPartyAnalyticsCoverage() {
  const raw = process.env.FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT?.trim();
  if (!raw) return null;
  const startedAt = new Date(raw);
  if (
    !Number.isFinite(startedAt.getTime()) ||
    startedAt.getTime() > Date.now() + 5 * 60 * 1000
  ) return null;
  const firstShanghaiDay = shanghaiDay(startedAt);
  const containingDayStart = new Date(`${firstShanghaiDay}T00:00:00.000+08:00`);
  const firstCompleteShanghaiDayStart = new Date(
    startedAt.getTime() === containingDayStart.getTime()
      ? containingDayStart.getTime()
      : containingDayStart.getTime() + dayMilliseconds,
  );
  return {
    startedAt: startedAt.toISOString(),
    firstCompleteShanghaiDayStart: firstCompleteShanghaiDayStart.toISOString(),
  };
}

export function firstPartyLandingAnalyticsStatus(): FirstPartyLandingAnalyticsStatus {
  const store = attributionStoreStatus();
  const coverage = firstPartyAnalyticsCoverage();
  if (!store.configured) {
    return {
      configured: false,
      provider: "first_party_upstash",
      detail: store.detail,
    };
  }
  if (!coverage) {
    return {
      configured: false,
      provider: "first_party_upstash",
      detail: "FIRST_PARTY_LANDING_ANALYTICS_STARTED_AT is missing or invalid.",
    };
  }
  return {
    configured: true,
    provider: "first_party_upstash",
    ...coverage,
  };
}

function shanghaiDay(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Attribution timestamp is invalid");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function assertSlug(value: string) {
  if (!safeSlug.test(value)) throw new Error("Attribution source slug is invalid");
}

async function redisCommand(command: Array<string | number>) {
  const config = redisConfig();
  if (!config) return { configured: false as const, result: null };
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Attribution store request failed: ${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: string };
  if (payload.error) throw new Error(`Attribution store rejected a command: ${payload.error}`);
  return { configured: true as const, result: payload.result };
}

async function redisPipeline(commands: Array<Array<string | number>>) {
  const config = redisConfig();
  if (!config) return { configured: false as const, results: [] as unknown[] };
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Attribution store pipeline failed: ${response.status}`);
  const payload = await response.json() as Array<{ result?: unknown; error?: string }>;
  const rejected = payload.find((item) => item.error);
  if (rejected?.error) throw new Error(`Attribution store rejected a pipeline command: ${rejected.error}`);
  return { configured: true as const, results: payload.map((item) => item.result) };
}

type OutboundClickInput = {
  clickId: string;
  keyword: string;
  location: OutboundLocation;
  sourceSlug: string;
  occurredAt: string;
  qualified: boolean;
};

async function recordProductOutboundClick(
  input: OutboundClickInput,
  product: "novelai" | "playworlds",
  eventName: string,
): Promise<AttributionWriteResult> {
  assertSlug(input.sourceSlug);
  const cohortDay = shanghaiDay(input.occurredAt);
  const event = {
    schemaVersion: 1,
    eventId: input.clickId,
    event: input.qualified ? eventName : `${product}_outbound_request`,
    product,
    ...input,
  };
  const response = await redisCommand([
    "EVAL",
    outboundScript,
    3,
    `${keyPrefix}event:outbound:${product}:${input.clickId}`,
    `${keyPrefix}click:${input.clickId}`,
    `${keyPrefix}cohort:${product}:${cohortDay}:${input.sourceSlug}`,
    JSON.stringify(event),
    retentionSeconds,
    input.sourceSlug,
    input.keyword,
    input.location,
    input.occurredAt,
    cohortDay,
    input.qualified ? "1" : "0",
    product,
  ]);
  if (!response.configured) {
    return { state: "unavailable", detail: attributionStoreStatus().detail ?? "Attribution store is not configured." };
  }
  if (response.result === -2) throw new Error("Click ID is already bound to another source slug");
  if (response.result === -3) throw new Error("Click ID is already bound to another product");
  return response.result === 0
    ? { state: "duplicate", detail: "The outbound click was already stored." }
    : { state: "stored", detail: input.qualified ? "Verified user navigation stored." : "Unverified navigation stored for audit only." };
}

/** Historical compatibility for the retired /go/novelai route. */
export async function recordOutboundClick(input: OutboundClickInput): Promise<AttributionWriteResult> {
  return recordProductOutboundClick(input, "novelai", "qualified_outbound_click");
}

export async function recordPlayworldsOutboundClick(
  input: OutboundClickInput,
): Promise<AttributionWriteResult> {
  return recordProductOutboundClick(
    input,
    "playworlds",
    playworldsAttribution.events.qualifiedOutbound,
  );
}

export async function recordLandingView(input: {
  sourceSlug: string;
  visitorId: string;
  viewId: string;
  rateLimitIdentity: string;
  occurredAt: string;
}): Promise<LandingViewWriteResult> {
  assertSlug(input.sourceSlug);
  if (!visitorIdPattern.test(input.visitorId) || !visitorIdPattern.test(input.viewId)) {
    throw new Error("Landing analytics visitor or view ID is invalid");
  }
  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new Error("Landing analytics timestamp is invalid");
  }
  const status = firstPartyLandingAnalyticsStatus();
  if (!status.configured || !status.startedAt) {
    return {
      state: "unavailable",
      detail: status.detail ?? "First-party landing analytics is not configured.",
    };
  }
  if (occurredAt.getTime() < Date.parse(status.startedAt)) {
    return {
      state: "unavailable",
      detail: "The landing view predates the configured analytics coverage start.",
    };
  }
  const config = redisConfig();
  if (!config) {
    return {
      state: "unavailable",
      detail: "Attribution store is not configured.",
    };
  }
  const cohortDay = shanghaiDay(occurredAt);
  const visitorHash = createHash("sha256")
    .update(`uv:v1\0${input.sourceSlug}\0${input.visitorId.toLowerCase()}`)
    .digest("hex");
  const rateLimitHash = createHmac("sha256", config.token)
    .update(`landing-rate:v1\0${input.rateLimitIdentity}`)
    .digest("hex");
  const rateLimitWindow = Math.floor(occurredAt.getTime() / 60_000);
  const response = await redisCommand([
    "EVAL",
    landingViewScript,
    4,
    `${keyPrefix}landing:event:{${input.sourceSlug}}:${input.viewId.toLowerCase()}`,
    `${keyPrefix}landing:day:{${input.sourceSlug}}:${cohortDay}`,
    `${keyPrefix}landing:hll:{${input.sourceSlug}}:${cohortDay}`,
    `${keyPrefix}landing:rate:{${input.sourceSlug}}:${rateLimitHash}:${rateLimitWindow}`,
    visitorHash,
    landingEventRetentionSeconds,
    retentionSeconds,
    landingRateLimitWindowSeconds * 2,
    landingRateLimitRequestsPerWindow,
  ]);
  if (!response.configured) {
    return {
      state: "unavailable",
      detail: attributionStoreStatus().detail ?? "Attribution store is not configured.",
    };
  }
  return response.result === -1
    ? {
        state: "rate_limited",
        detail: "The landing view rate limit was exceeded.",
      }
    : response.result === 0
    ? {
        state: "duplicate",
        detail: "The landing view was already stored.",
      }
    : response.result === 1
    ? {
        state: "stored",
        detail: "Anonymous first-party landing view stored in the Shanghai-day cohort.",
      }
    : {
        state: "unavailable",
        detail: "Attribution store did not confirm the landing view.",
      };
}

export async function recordLandingCoverageCheckpoint(input: {
  phase: "start" | "end";
  occurredAt: string;
}): Promise<LandingCoverageCheckpointResult> {
  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new Error("Landing analytics coverage timestamp is invalid");
  }
  const target = input.phase === "end"
    ? new Date(occurredAt.getTime() - 2 * 60 * 60 * 1_000)
    : occurredAt;
  const day = shanghaiDay(target);
  const response = await redisCommand([
    "EVAL",
    landingCoverageScript,
    1,
    `${keyPrefix}landing:coverage:${day}`,
    input.phase,
    occurredAt.toISOString(),
    retentionSeconds,
  ]);
  if (!response.configured || response.result !== 1) {
    return {
      state: "unavailable",
      day,
      phase: input.phase,
      detail: attributionStoreStatus().detail ??
        "Attribution store did not confirm the landing analytics coverage checkpoint.",
    };
  }
  return {
    state: "stored",
    day,
    phase: input.phase,
    detail: `Stored the ${input.phase} coverage checkpoint for Shanghai day ${day}.`,
  };
}

async function recordProductConversionEvent(
  event: AttributionConversionEvent | PlayworldsAttributionConversionEvent,
  product: "novelai" | "playworlds",
): Promise<AttributionWriteResult> {
  assertSlug(event.sourceSlug);
  const fallbackDay = shanghaiDay(event.occurredAt);
  const normalizedEventId = product === "playworlds"
    ? event.eventId.toLowerCase()
    : event.eventId;
  const normalizedClickId = product === "playworlds"
    ? event.clickId.toLowerCase()
    : event.clickId;
  const storedEvent = product === "playworlds"
    ? JSON.stringify({
        schemaVersion: event.schemaVersion,
        producer: "playworlds",
        product: "playworlds",
        eventId: normalizedEventId,
        clickId: normalizedClickId,
        sourceSlug: event.sourceSlug,
        event: event.event,
        occurredAt: new Date(event.occurredAt).toISOString(),
        ...(event.revenueMinor === undefined ? {} : { revenueMinor: event.revenueMinor }),
        ...(event.currency === undefined ? {} : { currency: event.currency }),
      })
    : JSON.stringify(event);
  const response = await redisCommand([
    "EVAL",
    conversionScript,
    3,
    product === "playworlds"
      ? `${keyPrefix}event:conversion:playworlds:${normalizedEventId}`
      : `${keyPrefix}event:conversion:${normalizedEventId}`,
    `${keyPrefix}click:${normalizedClickId}`,
    `${keyPrefix}callback:${product}:health`,
    storedEvent,
    retentionSeconds,
    event.sourceSlug,
    event.event,
    event.occurredAt,
    fallbackDay,
    event.revenueMinor ?? 0,
    event.currency ?? "",
    `${keyPrefix}cohort:`,
    product,
  ]);
  if (!response.configured) {
    return { state: "unavailable", detail: attributionStoreStatus().detail ?? "Attribution store is not configured." };
  }
  if (response.result === -2) throw new Error("Conversion source slug does not match its click ID");
  if (response.result === -3) {
    throw new Error(product === "playworlds"
      ? "Playworlds conversion callback cannot join a non-Playworlds outbound click"
      : "Legacy NovelAI conversion callbacks cannot join a Playworlds outbound click");
  }
  if (response.result === -4) {
    throw new Error("Conversion event ID is already bound to a different payload");
  }
  if (response.result === 0) return { state: "duplicate", detail: "The conversion event was already stored." };
  const orphan = response.result === 2;
  return {
    state: "stored",
    orphan,
    detail: orphan
      ? "The callback was stored, but no matching outbound event was available."
      : "The conversion was joined to its outbound click.",
  };
}

/** Historical compatibility for the retired NovelAI callback route. */
export async function recordConversionEvent(
  event: AttributionConversionEvent,
): Promise<AttributionWriteResult> {
  return recordProductConversionEvent(event, "novelai");
}

export async function recordPlayworldsConversionEvent(
  event: PlayworldsAttributionConversionEvent,
): Promise<AttributionWriteResult> {
  return recordProductConversionEvent(event, "playworlds");
}

export async function recordNovelAiIntegrationProbe(
  probe: NovelAiIntegrationProbe,
): Promise<AttributionWriteResult> {
  const response = await redisCommand([
    "SET",
    `${keyPrefix}integration:novelai`,
    JSON.stringify(probe),
    "EX",
    integrationProbeRetentionSeconds,
  ]);
  if (!response.configured) {
    return {
      state: "unavailable",
      detail: attributionStoreStatus().detail ?? "Attribution store is not configured.",
    };
  }
  return response.result === "OK"
    ? { state: "stored", detail: "NovelAI callback handshake stored without changing funnel metrics." }
    : { state: "unavailable", detail: "Attribution store did not confirm the NovelAI handshake." };
}

export async function readNovelAiIntegrationProbe(): Promise<NovelAiIntegrationProbeStatus> {
  const response = await redisCommand(["GET", `${keyPrefix}integration:novelai`]);
  if (!response.configured) {
    return {
      state: "unavailable",
      lastObservedAt: null,
      probeId: null,
      detail: attributionStoreStatus().detail ?? "Attribution store is not configured.",
    };
  }
  if (typeof response.result !== "string") {
    return {
      state: "unavailable",
      lastObservedAt: null,
      probeId: null,
      detail: "NovelAI has not completed a recent signed callback handshake.",
    };
  }
  try {
    const probe = JSON.parse(response.result) as Partial<NovelAiIntegrationProbe>;
    if (
      probe.schemaVersion !== 1 ||
      probe.producer !== "novelai" ||
      typeof probe.probeId !== "string" ||
      typeof probe.occurredAt !== "string" ||
      !Number.isFinite(Date.parse(probe.occurredAt))
    ) {
      throw new Error("invalid_probe");
    }
    return {
      state: "observed",
      lastObservedAt: probe.occurredAt,
      probeId: probe.probeId,
      detail: "Read the latest signed NovelAI callback handshake from the attribution store.",
    };
  } catch {
    return {
      state: "unavailable",
      lastObservedAt: null,
      probeId: null,
      detail: "The stored NovelAI callback handshake is malformed.",
    };
  }
}

export async function recordPlayworldsIntegrationProbe(
  probe: PlayworldsIntegrationProbe,
): Promise<AttributionWriteResult> {
  const normalizedProbe = {
    ...probe,
    probeId: probe.probeId.toLowerCase(),
  };
  const response = await redisCommand([
    "SET",
    `${keyPrefix}integration:playworlds`,
    JSON.stringify(normalizedProbe),
    "EX",
    integrationProbeRetentionSeconds,
  ]);
  if (!response.configured) {
    return {
      state: "unavailable",
      detail: attributionStoreStatus().detail ?? "Attribution store is not configured.",
    };
  }
  return response.result === "OK"
    ? { state: "stored", detail: "Playworlds callback handshake stored without changing funnel metrics." }
    : { state: "unavailable", detail: "Attribution store did not confirm the Playworlds handshake." };
}

export async function readPlayworldsIntegrationProbe(): Promise<PlayworldsIntegrationProbeStatus> {
  const response = await redisCommand(["GET", `${keyPrefix}integration:playworlds`]);
  if (!response.configured) {
    return {
      state: "unavailable",
      lastObservedAt: null,
      probeId: null,
      detail: attributionStoreStatus().detail ?? "Attribution store is not configured.",
    };
  }
  if (typeof response.result !== "string") {
    return {
      state: "unavailable",
      lastObservedAt: null,
      probeId: null,
      detail: "Playworlds has not completed a recent signed callback handshake.",
    };
  }
  try {
    const probe = JSON.parse(response.result) as Partial<PlayworldsIntegrationProbe>;
    if (
      probe.schemaVersion !== 1 ||
      probe.producer !== "playworlds" ||
      probe.product !== "playworlds" ||
      typeof probe.probeId !== "string" ||
      typeof probe.occurredAt !== "string" ||
      !Number.isFinite(Date.parse(probe.occurredAt))
    ) {
      throw new Error("invalid_probe");
    }
    return {
      state: "observed",
      lastObservedAt: probe.occurredAt,
      probeId: probe.probeId,
      detail: "Read the latest signed Playworlds callback handshake from the attribution store.",
    };
  } catch {
    return {
      state: "unavailable",
      lastObservedAt: null,
      probeId: null,
      detail: "The stored Playworlds callback handshake is malformed.",
    };
  }
}

export async function readPlayworldsCallbackHealth(): Promise<PlayworldsCallbackHealth> {
  const response = await redisCommand(["HGETALL", `${keyPrefix}callback:playworlds:health`]);
  if (!response.configured) {
    return {
      state: "unavailable",
      acceptedCallbacks: null,
      orphanCallbacks: null,
      lastAcceptedAt: null,
      detail: attributionStoreStatus().detail ?? "Attribution store is not configured.",
    };
  }
  const health = hashResult(response.result);
  const acceptedCallbacks = Number(health.acceptedCallbacks || 0);
  const orphanCallbacks = Number(health.orphanCallbacks || 0);
  const lastAcceptedAt = health.lastAcceptedAt || null;
  if (
    !Number.isInteger(acceptedCallbacks) || acceptedCallbacks < 0 ||
    !Number.isInteger(orphanCallbacks) || orphanCallbacks < 0 ||
    orphanCallbacks > acceptedCallbacks ||
    (lastAcceptedAt !== null && !Number.isFinite(Date.parse(lastAcceptedAt)))
  ) {
    return {
      state: "unavailable",
      acceptedCallbacks: null,
      orphanCallbacks: null,
      lastAcceptedAt: null,
      detail: "The stored Playworlds callback health record is malformed.",
    };
  }
  return {
    state: "observed",
    acceptedCallbacks,
    orphanCallbacks,
    lastAcceptedAt,
    detail: "Read the global Playworlds callback join health from the attribution store.",
  };
}

function periodDays(periodStart: string, periodEnd: string) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error("Attribution reporting period is invalid");
  }
  const durationDays = (end.getTime() - start.getTime()) / 86_400_000;
  if (durationDays > 93) throw new Error("Attribution reporting period cannot exceed 93 days");
  const days = new Set<string>();
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += 86_400_000) {
    days.add(shanghaiDay(new Date(cursor)));
  }
  days.add(shanghaiDay(new Date(end.getTime() - 1)));
  return [...days].sort();
}

function hashResult(value: unknown) {
  if (Array.isArray(value)) {
    const result: Record<string, string> = {};
    for (let index = 0; index < value.length; index += 2) {
      if (typeof value[index] === "string") result[value[index] as string] = String(value[index + 1] ?? "0");
    }
    return result;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
  }
  return {};
}

export async function readAttributionAggregate(input: {
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
}): Promise<AttributionAggregate> {
  assertSlug(input.sourceSlug);
  const days = periodDays(input.periodStart, input.periodEnd);
  const response = await redisPipeline(days.map((day) => [
    "HGETALL",
    `${keyPrefix}cohort:playworlds:${day}:${input.sourceSlug}`,
  ]));
  if (!response.configured) {
    return {
      state: "unavailable",
      sourceSlug: input.sourceSlug,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      qualifiedOutboundClicks: null,
      outboundRequests: null,
      trialStarts: null,
      signups: null,
      paidConversions: null,
      purchaseEvents: null,
      orphanCallbacks: null,
      revenueByCurrency: {},
      ctaLocations: {},
      detail: attributionStoreStatus().detail ?? "Attribution store is not configured.",
    };
  }

  const totals = {
    qualifiedOutboundClicks: 0,
    outboundRequests: 0,
    trialStarts: 0,
    signups: 0,
    paidConversions: 0,
    purchaseEvents: 0,
    orphanCallbacks: 0,
  };
  const revenueByCurrency: Record<string, number> = {};
  const ctaLocations: Record<string, number> = {};
  for (const raw of response.results) {
    const hash = hashResult(raw);
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[key] += Number(hash[key] || 0);
    }
    for (const [field, value] of Object.entries(hash)) {
      if (field.startsWith("revenueMinor:")) {
        const currency = field.slice("revenueMinor:".length);
        if (currency) revenueByCurrency[currency] = (revenueByCurrency[currency] || 0) + Number(value || 0);
      }
      if (field.startsWith("cta:")) {
        const location = field.slice("cta:".length);
        ctaLocations[location] = (ctaLocations[location] || 0) + Number(value || 0);
      }
    }
  }

  return {
    state: "observed",
    sourceSlug: input.sourceSlug,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    ...totals,
    revenueByCurrency,
    ctaLocations,
    detail: `Read ${days.length} Playworlds Shanghai-day acquisition cohort${days.length === 1 ? "" : "s"} from Upstash Redis.`,
  };
}

export async function readFirstPartyLandingAnalytics(input: {
  sourceSlug: string;
  periodStart: string;
  periodEnd: string;
}): Promise<FirstPartyLandingAnalyticsResult> {
  assertSlug(input.sourceSlug);
  const days = periodDays(input.periodStart, input.periodEnd);
  const status = firstPartyLandingAnalyticsStatus();
  if (!status.configured || !status.firstCompleteShanghaiDayStart) {
    return {
      state: "unavailable",
      visitors: null,
      pageviews: null,
      detail: status.detail ?? "First-party landing analytics is not configured.",
    };
  }
  if (Date.parse(input.periodStart) < Date.parse(status.firstCompleteShanghaiDayStart)) {
    return {
      state: "unavailable",
      visitors: null,
      pageviews: null,
      detail: `The requested period begins before complete first-party coverage on ${status.firstCompleteShanghaiDayStart}.`,
    };
  }
  const hllKeys = days.map(
    (day) => `${keyPrefix}landing:hll:{${input.sourceSlug}}:${day}`,
  );
  const response = await redisPipeline([
    ["PFCOUNT", ...hllKeys],
    ...days.map((day) => [
      "HGET",
      `${keyPrefix}landing:day:{${input.sourceSlug}}:${day}`,
      "pageviews",
    ]),
    ...days.map((day) => [
      "HGETALL",
      `${keyPrefix}landing:coverage:${day}`,
    ]),
  ]);
  if (!response.configured) {
    return {
      state: "unavailable",
      visitors: null,
      pageviews: null,
      detail: attributionStoreStatus().detail ?? "Attribution store is not configured.",
    };
  }
  const visitors = Number(response.results[0] ?? 0);
  const pageviews = response.results
    .slice(1, 1 + days.length)
    .reduce<number>((total, value) => total + Number(value ?? 0), 0);
  const coverage = response.results.slice(1 + days.length);
  const uncoveredDay = days.find((day, index) => {
    const checkpoint = hashResult(coverage[index]);
    const startAt = Date.parse(checkpoint.startAt || "");
    const endAt = Date.parse(checkpoint.endAt || "");
    const dayStart = Date.parse(`${day}T00:00:00.000+08:00`);
    const dayEnd = dayStart + dayMilliseconds;
    return !Number.isFinite(startAt) || !Number.isFinite(endAt) ||
      startAt < dayStart - 60_000 ||
      startAt > dayStart + 70 * 60_000 ||
      endAt < dayEnd - 10 * 60_000 ||
      endAt > dayEnd + 70 * 60_000;
  });
  if (uncoveredDay) {
    return {
      state: "unavailable",
      visitors: null,
      pageviews: null,
      detail: `First-party landing analytics has no complete start/end coverage proof for Shanghai day ${uncoveredDay}.`,
    };
  }
  if (!Number.isFinite(visitors) || visitors < 0 || !Number.isFinite(pageviews) || pageviews < 0) {
    return {
      state: "unavailable",
      visitors: null,
      pageviews: null,
      detail: "First-party landing analytics returned invalid aggregate counts.",
    };
  }
  return {
    state: "observed",
    visitors,
    pageviews,
    detail: `Observed ${days.length} complete Shanghai-day cohort${days.length === 1 ? "" : "s"} through privacy-minimized first-party Upstash analytics; UV is a HyperLogLog estimate and pageviews are exact counters.`,
  };
}
