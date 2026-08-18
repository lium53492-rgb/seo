function decodeHtmlHref(value) {
  return String(value)
    .replaceAll(/&amp;/gi, "&")
    .replaceAll(/&#0*38;/g, "&")
    .replaceAll(/&#x0*26;/gi, "&");
}

export function readBuiltAttributedCtaContracts({
  allowedCtaLocations,
  destinations,
  html,
  pageSlug,
  requireDestinationPlatform,
  routePrefix,
}) {
  const allowedLocations = new Set(allowedCtaLocations || []);
  const expectedPath = `${routePrefix}/${pageSlug}`;
  const hrefs = [...String(html).matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)]
    .map((match) => decodeHtmlHref(match[1]));
  const contracts = [];

  for (const href of hrefs) {
    let url;
    try {
      url = new URL(href, "https://built-page.invalid");
    } catch {
      continue;
    }
    if (url.pathname !== expectedPath) continue;

    const locations = url.searchParams.getAll("location");
    if (locations.length !== 1 || !allowedLocations.has(locations[0])) {
      throw new Error(`/${pageSlug} contains an invalid or duplicate CTA location.`);
    }
    const contract = { location: locations[0] };

    if (requireDestinationPlatform) {
      const destinationPlatforms = url.searchParams.getAll("destinationPlatform");
      if (destinationPlatforms.length !== 1) {
        throw new Error(`/${pageSlug} Playworlds CTA must contain exactly one destinationPlatform.`);
      }
      const destinationPlatform = destinationPlatforms[0];
      const destination = destinations?.[destinationPlatform];
      if (!destination?.enabled || !destination.url) {
        throw new Error(`/${pageSlug} Playworlds CTA uses a disabled or unknown destination platform: ${destinationPlatform || "<empty>"}.`);
      }
      contract.destinationPlatform = destinationPlatform;
    }
    contracts.push(contract);
  }

  return contracts;
}
