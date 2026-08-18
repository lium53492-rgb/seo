import { after, NextResponse } from "next/server";
import playworldsAttribution from "@/data/config/playworlds-attribution.json";
import {
  createSeoClickId,
  logSeoGrowthEvent,
  normalizeOutboundLocation,
} from "@/lib/seo/attribution";
import { recordPlayworldsOutboundClick } from "@/lib/seo/attribution-store";
import {
  buildPlayworldsAttributionUrl,
  resolvePlayworldsDestination,
} from "@/lib/seo/playworlds-attribution";
import { readPublishedPage } from "@/lib/seo/page-store";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

async function resolveAttributionRequest(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const page = await readPublishedPage(slug);
  if (!page) return null;

  const requestUrl = new URL(request.url);
  const location = normalizeOutboundLocation(requestUrl.searchParams.get("location"));
  const resolvedDestination = resolvePlayworldsDestination(
    requestUrl.searchParams.get("destinationPlatform"),
  );
  const clickId = createSeoClickId();
  const occurredAt = new Date().toISOString();
  return {
    clickId,
    destination: buildPlayworldsAttributionUrl({
      clickId,
      destinationPlatform: resolvedDestination.destinationPlatform,
      keyword: page.keyword,
      location,
      sourceSlug: page.slug,
    }),
    destinationHost: resolvedDestination.destinationHost,
    destinationPlatform: resolvedDestination.destinationPlatform,
    destinationUrl: resolvedDestination.destinationUrl,
    keyword: page.keyword,
    location,
    occurredAt,
    sourceSlug: page.slug,
  };
}

function redirectResponse(destination: URL) {
  const response = NextResponse.redirect(destination, 307);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export async function HEAD(request: Request, context: RouteContext) {
  try {
    const attribution = await resolveAttributionRequest(request, context);
    if (!attribution) return new Response(null, { status: 404 });
    return redirectResponse(attribution.destination);
  } catch (error) {
    return new Response(null, {
      status: 400,
      statusText: error instanceof Error ? error.message : "Invalid destination platform",
    });
  }
}

export async function GET(request: Request, context: RouteContext) {
  let attribution: Awaited<ReturnType<typeof resolveAttributionRequest>>;
  try {
    attribution = await resolveAttributionRequest(request, context);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid destination platform", {
      status: 400,
    });
  }
  if (!attribution) return new Response("Unknown SEO source", { status: 404 });
  const qualified = request.headers.get("sec-fetch-user") === "?1";

  logSeoGrowthEvent(playworldsAttribution.events.navigation, {
    clickId: attribution.clickId,
    destinationHost: attribution.destinationHost,
    destinationPlatform: attribution.destinationPlatform,
    destinationUrl: attribution.destinationUrl,
    keyword: attribution.keyword,
    location: attribution.location,
    product: playworldsAttribution.product,
    qualified,
    sourceSlug: attribution.sourceSlug,
  });
  after(async () => {
    try {
      const result = await recordPlayworldsOutboundClick({
        clickId: attribution.clickId,
        destinationHost: attribution.destinationHost,
        destinationPlatform: attribution.destinationPlatform,
        destinationUrl: attribution.destinationUrl,
        keyword: attribution.keyword,
        location: attribution.location,
        occurredAt: attribution.occurredAt,
        qualified,
        sourceSlug: attribution.sourceSlug,
      });
      logSeoGrowthEvent(playworldsAttribution.events.persistence, {
        clickId: attribution.clickId,
        destinationHost: attribution.destinationHost,
        destinationPlatform: attribution.destinationPlatform,
        destinationUrl: attribution.destinationUrl,
        product: playworldsAttribution.product,
        qualified,
        sourceSlug: attribution.sourceSlug,
        state: result.state,
      });
    } catch (error) {
      logSeoGrowthEvent(playworldsAttribution.events.persistenceFailed, {
        clickId: attribution.clickId,
        destinationHost: attribution.destinationHost,
        destinationPlatform: attribution.destinationPlatform,
        destinationUrl: attribution.destinationUrl,
        product: playworldsAttribution.product,
        reason: error instanceof Error ? error.message : "unknown_error",
        sourceSlug: attribution.sourceSlug,
      });
    }
  });

  return redirectResponse(attribution.destination);
}
