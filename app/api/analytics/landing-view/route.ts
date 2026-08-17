import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logSeoGrowthEvent } from "@/lib/seo/attribution";
import { recordLandingView } from "@/lib/seo/attribution-store";
import { readPublishedPage } from "@/lib/seo/page-store";
import { getSiteUrl } from "@/lib/seo/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const visitorCookie = "__Host-lorelens_vid";
const visitorCookieMaxAge = 400 * 24 * 60 * 60;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const botPattern = /bot|crawler|spider|headless|lighthouse|pagespeed|slurp/i;

function noStoreResponse(status: number, headers?: HeadersInit) {
  return new NextResponse(null, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Origin",
      ...headers,
    },
  });
}

function requestRateLimitIdentity(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  return forwardedFor && /^[0-9a-f:.]{2,64}$/i.test(forwardedFor)
    ? forwardedFor
    : "unknown";
}

function expectedRequestOrigin(request: NextRequest) {
  const production = process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";
  return production ? getSiteUrl().origin : request.nextUrl.origin;
}

function requestOriginAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === expectedRequestOrigin(request) &&
    (fetchSite === null || fetchSite === "same-origin");
}

function requestContextMatchesPage(request: NextRequest, sourceSlug: string) {
  const fetchDestination = request.headers.get("sec-fetch-dest");
  if (fetchDestination !== null && fetchDestination !== "empty") return false;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const url = new URL(referer);
    return url.origin === expectedRequestOrigin(request) &&
      url.pathname.replace(/\/$/, "") === `/${sourceSlug}`;
  } catch {
    return false;
  }
}

function validPayload(value: unknown): value is { sourceSlug: string; viewId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(",") === "sourceSlug,viewId" &&
    typeof record.sourceSlug === "string" &&
    typeof record.viewId === "string" &&
    uuidPattern.test(record.viewId);
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  logSeoGrowthEvent("landing_view_start", { requestId });

  if (!requestOriginAllowed(request)) {
    logSeoGrowthEvent("landing_view_rejected", {
      reason: "origin",
      requestId,
      durationMs: Date.now() - startedAt,
    });
    return noStoreResponse(403);
  }
  if (
    request.headers.get("sec-gpc") === "1" ||
    request.headers.get("dnt") === "1"
  ) {
    logSeoGrowthEvent("landing_view_ignored", {
      reason: "privacy_preference",
      requestId,
      durationMs: Date.now() - startedAt,
    });
    return noStoreResponse(204);
  }
  if (botPattern.test(request.headers.get("user-agent") || "")) {
    logSeoGrowthEvent("landing_view_ignored", {
      reason: "bot_user_agent",
      requestId,
      durationMs: Date.now() - startedAt,
    });
    return noStoreResponse(204);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(contentLength) || contentLength > 512) {
    return noStoreResponse(413);
  }
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return noStoreResponse(415);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > 512) return noStoreResponse(413);
    payload = JSON.parse(body);
  } catch {
    return noStoreResponse(400);
  }
  if (!validPayload(payload)) return noStoreResponse(400);
  if (!requestContextMatchesPage(request, payload.sourceSlug)) {
    return noStoreResponse(403);
  }

  const page = await readPublishedPage(payload.sourceSlug);
  if (!page) return noStoreResponse(404);

  const existingVisitorId = request.cookies.get(visitorCookie)?.value || "";
  const visitorId = uuidPattern.test(existingVisitorId)
    ? existingVisitorId
    : randomUUID();
  try {
    const result = await recordLandingView({
      sourceSlug: page.slug,
      visitorId,
      viewId: payload.viewId,
      rateLimitIdentity: requestRateLimitIdentity(request),
      occurredAt: new Date().toISOString(),
    });
    if (result.state === "rate_limited") {
      logSeoGrowthEvent("landing_view_rejected", {
        reason: "rate_limit",
        requestId,
        sourceSlug: page.slug,
        durationMs: Date.now() - startedAt,
      });
      return noStoreResponse(429, { "Retry-After": "60" });
    }
    if (result.state === "unavailable") {
      logSeoGrowthEvent("landing_view_failed", {
        reason: result.detail,
        requestId,
        sourceSlug: page.slug,
        durationMs: Date.now() - startedAt,
      });
      return noStoreResponse(503);
    }
    const response = noStoreResponse(204);
    if (!uuidPattern.test(existingVisitorId)) {
      response.cookies.set(visitorCookie, visitorId, {
        httpOnly: true,
        maxAge: visitorCookieMaxAge,
        path: "/",
        sameSite: "lax",
        secure: true,
      });
    }
    logSeoGrowthEvent("landing_view_stored", {
      requestId,
      sourceSlug: page.slug,
      state: result.state,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logSeoGrowthEvent("landing_view_failed", {
      reason: error instanceof Error ? error.message : "unknown_error",
      requestId,
      sourceSlug: page.slug,
      durationMs: Date.now() - startedAt,
    });
    return noStoreResponse(503);
  }
}
