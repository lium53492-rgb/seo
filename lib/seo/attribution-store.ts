import type { OutboundLocation } from "./attribution";

const keyPrefix = "seo:v1:";
const retentionSeconds = 400 * 24 * 60 * 60;
const requestTimeoutMs = 2_500;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const outboundScript = `
local existingSource = redis.call("HGET", KEYS[2], "sourceSlug")
if existingSource and existingSource ~= ARGV[3] then return -2 end
if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
redis.call("HSET", KEYS[2],
  "sourceSlug", ARGV[3],
  "keyword", ARGV[4],
  "location", ARGV[5],
  "occurredAt", ARGV[6],
  "cohortDay", ARGV[7],
  "qualified", ARGV[8])
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
if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
local sourceSlug = redis.call("HGET", KEYS[2], "sourceSlug")
local cohortDay = redis.call("HGET", KEYS[2], "cohortDay")
local orphan = 0
if sourceSlug then
  if sourceSlug ~= ARGV[3] then return -2 end
else
  sourceSlug = ARGV[3]
  cohortDay = ARGV[6]
  orphan = 1
  redis.call("HSET", KEYS[2],
    "sourceSlug", sourceSlug,
    "cohortDay", cohortDay,
    "occurredAt", ARGV[5],
    "qualified", "1",
    "orphan", "1")
end
local cohortKey = ARGV[9] .. cohortDay .. ":" .. sourceSlug
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
if orphan == 1 then redis.call("HINCRBY", cohortKey, "orphanCallbacks", 1) end
redis.call("EXPIRE", KEYS[2], ARGV[2])
redis.call("EXPIRE", cohortKey, ARGV[2])
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

export type AttributionWriteResult = {
  state: "stored" | "duplicate" | "unavailable";
  detail: string;
  orphan?: boolean;
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

export async function recordOutboundClick(input: {
  clickId: string;
  keyword: string;
  location: OutboundLocation;
  sourceSlug: string;
  occurredAt: string;
  qualified: boolean;
}): Promise<AttributionWriteResult> {
  assertSlug(input.sourceSlug);
  const cohortDay = shanghaiDay(input.occurredAt);
  const event = {
    schemaVersion: 1,
    eventId: input.clickId,
    event: "qualified_outbound_click",
    ...input,
  };
  const response = await redisCommand([
    "EVAL",
    outboundScript,
    3,
    `${keyPrefix}event:outbound:${input.clickId}`,
    `${keyPrefix}click:${input.clickId}`,
    `${keyPrefix}cohort:${cohortDay}:${input.sourceSlug}`,
    JSON.stringify(event),
    retentionSeconds,
    input.sourceSlug,
    input.keyword,
    input.location,
    input.occurredAt,
    cohortDay,
    input.qualified ? "1" : "0",
  ]);
  if (!response.configured) {
    return { state: "unavailable", detail: attributionStoreStatus().detail ?? "Attribution store is not configured." };
  }
  if (response.result === -2) throw new Error("Click ID is already bound to another source slug");
  return response.result === 0
    ? { state: "duplicate", detail: "The outbound click was already stored." }
    : { state: "stored", detail: input.qualified ? "Verified user navigation stored." : "Unverified navigation stored for audit only." };
}

export async function recordConversionEvent(event: AttributionConversionEvent): Promise<AttributionWriteResult> {
  assertSlug(event.sourceSlug);
  const fallbackDay = shanghaiDay(event.occurredAt);
  const response = await redisCommand([
    "EVAL",
    conversionScript,
    2,
    `${keyPrefix}event:conversion:${event.eventId}`,
    `${keyPrefix}click:${event.clickId}`,
    JSON.stringify(event),
    retentionSeconds,
    event.sourceSlug,
    event.event,
    event.occurredAt,
    fallbackDay,
    event.revenueMinor ?? 0,
    event.currency ?? "",
    `${keyPrefix}cohort:`,
  ]);
  if (!response.configured) {
    return { state: "unavailable", detail: attributionStoreStatus().detail ?? "Attribution store is not configured." };
  }
  if (response.result === -2) throw new Error("Conversion source slug does not match its click ID");
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
    `${keyPrefix}cohort:${day}:${input.sourceSlug}`,
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
    detail: `Read ${days.length} Shanghai-day acquisition cohort${days.length === 1 ? "" : "s"} from Upstash Redis.`,
  };
}
