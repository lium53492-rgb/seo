import { after, NextResponse } from "next/server";
import {
  buildNovelAiAttributionUrl,
  createSeoClickId,
  logSeoGrowthEvent,
  normalizeOutboundLocation,
} from "@/lib/seo/attribution";
import { recordOutboundClick } from "@/lib/seo/attribution-store";
import { readPublishedPage } from "@/lib/seo/page-store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await readPublishedPage(slug);
  if (!page) return new Response("Unknown SEO source", { status: 404 });

  const requestUrl = new URL(request.url);
  const location = normalizeOutboundLocation(requestUrl.searchParams.get("location"));
  const clickId = createSeoClickId();
  const occurredAt = new Date().toISOString();
  const qualified = request.headers.get("sec-fetch-user") === "?1";
  const destination = buildNovelAiAttributionUrl({
    clickId,
    keyword: page.keyword,
    location,
    sourceSlug: page.slug,
  });

  logSeoGrowthEvent("outbound_navigation", {
    clickId,
    keyword: page.keyword,
    location,
    qualified,
    sourceSlug: page.slug,
  });
  after(async () => {
    try {
      const result = await recordOutboundClick({
        clickId,
        keyword: page.keyword,
        location,
        occurredAt,
        qualified,
        sourceSlug: page.slug,
      });
      logSeoGrowthEvent("outbound_persistence", {
        clickId,
        qualified,
        sourceSlug: page.slug,
        state: result.state,
      });
    } catch (error) {
      logSeoGrowthEvent("outbound_persistence_failed", {
        clickId,
        reason: error instanceof Error ? error.message : "unknown_error",
        sourceSlug: page.slug,
      });
    }
  });

  const response = NextResponse.redirect(destination, 307);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}
