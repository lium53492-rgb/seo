import playworldsAttribution from "../../data/config/playworlds-attribution.json" with { type: "json" };
import type { OutboundLocation } from "./attribution";

const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumKeywordLength = 200;

export type { OutboundLocation };

export const playworldsAttributionContract = Object.freeze({
  ...playworldsAttribution,
  allowedCtaLocations: Object.freeze([...playworldsAttribution.allowedCtaLocations]),
  events: Object.freeze({ ...playworldsAttribution.events }),
  utm: Object.freeze({ ...playworldsAttribution.utm }),
});

function approvedPlayworldsDestination(
  value = process.env.PLAYWORLDS_DESTINATION_URL || playworldsAttribution.destination,
) {
  const expected = new URL(playworldsAttribution.destination);
  const destination = new URL(value);
  const normalizedPath = destination.pathname.endsWith("/")
    ? destination.pathname
    : `${destination.pathname}/`;

  if (
    destination.protocol !== "https:" ||
    destination.username ||
    destination.password ||
    destination.port ||
    destination.hostname !== expected.hostname ||
    normalizedPath !== expected.pathname ||
    destination.search ||
    destination.hash
  ) {
    throw new Error(
      "PLAYWORLDS_DESTINATION_URL must be the official HTTPS Steam listing for Playworlds app 4911480",
    );
  }
  destination.pathname = expected.pathname;
  return destination;
}

export function buildPlayworldsAttributionUrl({
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
  if (!uuid.test(clickId)) throw new Error("Attribution click ID must be a UUID");
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword || normalizedKeyword.length > maximumKeywordLength) {
    throw new Error("Attribution keyword must contain 1-200 characters");
  }
  if (!playworldsAttribution.allowedCtaLocations.includes(location)) {
    throw new Error("Attribution CTA location is invalid");
  }

  const url = approvedPlayworldsDestination(destination);
  url.searchParams.set("utm_source", playworldsAttribution.utm.source);
  url.searchParams.set("utm_medium", playworldsAttribution.utm.medium);
  url.searchParams.set("utm_campaign", playworldsAttribution.utm.campaign);
  url.searchParams.set("utm_content", sourceSlug);
  url.searchParams.set("utm_term", normalizedKeyword);
  url.searchParams.set("seo_click_id", clickId);
  url.searchParams.set("seo_source_slug", sourceSlug);
  url.searchParams.set("seo_cta_location", location);
  url.searchParams.set("seo_product", playworldsAttribution.product);
  url.searchParams.set("seo_attribution_version", String(playworldsAttribution.schemaVersion));
  return url;
}
