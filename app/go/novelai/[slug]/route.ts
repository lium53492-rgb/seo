import { NextResponse } from "next/server";
import {
  buildNovelAiAttributionUrl,
  createSeoClickId,
  logSeoGrowthEvent,
  normalizeOutboundLocation,
} from "@/lib/seo/attribution";
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
  const destination = buildNovelAiAttributionUrl({
    clickId,
    keyword: page.keyword,
    location,
    sourceSlug: page.slug,
  });

  logSeoGrowthEvent("qualified_outbound_click", {
    clickId,
    keyword: page.keyword,
    location,
    sourceSlug: page.slug,
  });

  const response = NextResponse.redirect(destination, 307);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}
