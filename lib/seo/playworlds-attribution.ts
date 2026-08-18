import playworldsAttribution from "../../data/config/playworlds-attribution.json" with { type: "json" };
import type { OutboundLocation } from "./attribution";

const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumKeywordLength = 200;

export type { OutboundLocation };
export type PlayworldsDestinationPlatform = keyof typeof playworldsAttribution.destinations;

export type ResolvedPlayworldsDestination = {
  destinationHost: string;
  destinationPlatform: PlayworldsDestinationPlatform;
  destinationUrl: string;
  url: URL;
};

export const playworldsAttributionContract = Object.freeze({
  ...playworldsAttribution,
  allowedCtaLocations: Object.freeze([...playworldsAttribution.allowedCtaLocations]),
  destinations: Object.freeze(Object.fromEntries(
    Object.entries(playworldsAttribution.destinations).map(([key, definition]) => [
      key,
      Object.freeze({
        ...definition,
        allowedHosts: Object.freeze([...definition.allowedHosts]),
      }),
    ]),
  )),
  events: Object.freeze({ ...playworldsAttribution.events }),
  utm: Object.freeze({ ...playworldsAttribution.utm }),
});

export const defaultPlayworldsDestinationPlatform =
  playworldsAttribution.defaultDestinationPlatform as PlayworldsDestinationPlatform;

export function normalizePlayworldsDestinationPlatform(
  value?: string | null,
): PlayworldsDestinationPlatform {
  const candidate = (value || defaultPlayworldsDestinationPlatform).trim().toLowerCase();
  if (!Object.hasOwn(playworldsAttribution.destinations, candidate)) {
    throw new Error("Playworlds destination platform is not allowlisted");
  }
  return candidate as PlayworldsDestinationPlatform;
}

function normalizedPath(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

export function resolvePlayworldsDestination(
  destinationPlatform?: string | null,
  destinationOverride?: string,
): ResolvedPlayworldsDestination {
  const platform = normalizePlayworldsDestinationPlatform(destinationPlatform);
  const definition = playworldsAttribution.destinations[platform];
  if (!definition.enabled || !definition.url) {
    throw new Error(`Playworlds destination platform ${platform} is not enabled`);
  }
  if (destinationOverride && platform !== "steam") {
    throw new Error("Only the legacy Steam destination override is supported");
  }

  const configuredValue = platform === "steam"
    ? process.env.PLAYWORLDS_DESTINATION_URL || definition.url
    : definition.url;
  const destination = new URL(destinationOverride || configuredValue);
  const exactPath = definition.exactPath ? normalizedPath(definition.exactPath) : null;
  const path = normalizedPath(destination.pathname);

  if (
    destination.protocol !== "https:" ||
    destination.username ||
    destination.password ||
    destination.port ||
    !definition.allowedHosts.includes(destination.hostname) ||
    (exactPath !== null && path !== exactPath) ||
    destination.search ||
    destination.hash
  ) {
    throw new Error(
      platform === "steam"
        ? "PLAYWORLDS_DESTINATION_URL must be the official HTTPS Steam listing for Playworlds app 4911480"
        : `Configured Playworlds ${platform} destination is outside its HTTPS host allowlist`,
    );
  }

  destination.pathname = exactPath || path;
  return {
    destinationHost: destination.hostname,
    destinationPlatform: platform,
    destinationUrl: destination.toString(),
    url: destination,
  };
}

export function buildPlayworldsAttributionUrl({
  clickId,
  keyword,
  location,
  sourceSlug,
  destinationPlatform = defaultPlayworldsDestinationPlatform,
  destination,
}: {
  clickId: string;
  keyword: string;
  location: OutboundLocation;
  sourceSlug: string;
  destinationPlatform?: PlayworldsDestinationPlatform;
  /** Test and legacy deployment compatibility; the public route never accepts a URL. */
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

  const resolved = resolvePlayworldsDestination(destinationPlatform, destination);
  const url = new URL(resolved.url);
  url.searchParams.set("utm_source", playworldsAttribution.utm.source);
  url.searchParams.set("utm_medium", playworldsAttribution.utm.medium);
  url.searchParams.set("utm_campaign", playworldsAttribution.utm.campaign);
  url.searchParams.set("utm_content", `${sourceSlug}:${location}`);
  url.searchParams.set("utm_term", normalizedKeyword);
  url.searchParams.set("seo_click_id", clickId);
  url.searchParams.set("seo_source_slug", sourceSlug);
  url.searchParams.set("seo_cta_location", location);
  url.searchParams.set("seo_destination_platform", resolved.destinationPlatform);
  url.searchParams.set("seo_destination_host", resolved.destinationHost);
  url.searchParams.set("seo_product", playworldsAttribution.product);
  url.searchParams.set("seo_attribution_version", String(playworldsAttribution.schemaVersion));
  return url;
}
