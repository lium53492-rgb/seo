import { randomUUID } from "node:crypto";

const defaultDestination = "https://www.novelai.ai/zh-CN/";
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedLocations = new Set(["seo_page", "hero", "header", "inline", "final_cta", "companion"]);

export type OutboundLocation =
  | "seo_page"
  | "hero"
  | "header"
  | "inline"
  | "final_cta"
  | "companion";

export function normalizeOutboundLocation(value: string | null): OutboundLocation {
  return allowedLocations.has(value || "") ? value as OutboundLocation : "seo_page";
}

export function createSeoClickId() {
  return randomUUID();
}

function approvedDestination(value = process.env.NOVELAI_DESTINATION_URL || defaultDestination) {
  const destination = new URL(value);
  if (destination.protocol !== "https:" || !["novelai.ai", "www.novelai.ai"].includes(destination.hostname)) {
    throw new Error("NOVELAI_DESTINATION_URL must be an HTTPS NovelAI URL");
  }
  return destination;
}

export function buildNovelAiAttributionUrl({
  clickId,
  keyword,
  location,
  sourceSlug,
  destination,
}: {
  clickId: string;
  keyword: string;
  location: OutboundLocation;
  sourceSlug: string;
  destination?: string;
}) {
  if (!safeSlug.test(sourceSlug)) throw new Error("Attribution source slug is invalid");
  const url = approvedDestination(destination);
  url.searchParams.set("utm_source", "novelai_seo");
  url.searchParams.set("utm_medium", "organic_landing");
  url.searchParams.set("utm_campaign", "seo_revenue");
  url.searchParams.set("utm_content", sourceSlug);
  url.searchParams.set("utm_term", keyword);
  url.searchParams.set("seo_click_id", clickId);
  url.searchParams.set("seo_source_slug", sourceSlug);
  url.searchParams.set("seo_cta_location", location);
  return url;
}

export function logSeoGrowthEvent(event: string, payload: Record<string, unknown>) {
  console.info(JSON.stringify({
    scope: "seo_growth",
    event,
    occurredAt: new Date().toISOString(),
    ...payload,
  }));
}
