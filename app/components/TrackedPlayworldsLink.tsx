"use client";

import { track } from "@vercel/analytics";
import playworldsAttribution from "@/data/config/playworlds-attribution.json";
import type { OutboundLocation } from "@/lib/seo/playworlds-attribution";

type TrackedPlayworldsLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "target" | "rel" | "children"
> & {
  children: React.ReactNode;
  sourceSlug: string;
  location?: OutboundLocation;
};

export function TrackedPlayworldsLink({
  children,
  className,
  sourceSlug,
  location = "seo_page",
  onClick,
  ...anchorProps
}: TrackedPlayworldsLinkProps) {
  const href = `${playworldsAttribution.routePrefix}/${encodeURIComponent(sourceSlug)}?location=${encodeURIComponent(location)}`;
  return (
    <a
      {...anchorProps}
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        track(playworldsAttribution.events.clientClick, {
          destination: "playworlds_steam",
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
