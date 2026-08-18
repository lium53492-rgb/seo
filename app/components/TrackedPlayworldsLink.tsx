"use client";

import { track } from "@vercel/analytics";
import playworldsAttribution from "@/data/config/playworlds-attribution.json";
import type {
  OutboundLocation,
  PlayworldsDestinationPlatform,
} from "@/lib/seo/playworlds-attribution";

type TrackedPlayworldsLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "target" | "rel" | "children"
> & {
  children: React.ReactNode;
  sourceSlug: string;
  location?: OutboundLocation;
  destinationPlatform?: PlayworldsDestinationPlatform;
};

export function TrackedPlayworldsLink({
  children,
  className,
  sourceSlug,
  location = "seo_page",
  destinationPlatform = playworldsAttribution.defaultDestinationPlatform as PlayworldsDestinationPlatform,
  onClick,
  ...anchorProps
}: TrackedPlayworldsLinkProps) {
  const destination = playworldsAttribution.destinations[destinationPlatform];
  if (!destination?.enabled || !destination.url) {
    throw new Error(`Playworlds destination platform ${destinationPlatform} is not enabled`);
  }
  const destinationUrl = new URL(destination.url);
  const query = new URLSearchParams({
    destinationPlatform,
    location,
  });
  const href = `${playworldsAttribution.routePrefix}/${encodeURIComponent(sourceSlug)}?${query}`;
  return (
    <a
      {...anchorProps}
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        track(playworldsAttribution.events.clientClick, {
          destinationHost: destinationUrl.hostname,
          destinationPlatform,
          destinationUrl: destinationUrl.toString(),
          location,
          sourceSlug,
        });
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}
