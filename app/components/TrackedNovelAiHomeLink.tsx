"use client";

import { track } from "@vercel/analytics";
import type { OutboundLocation } from "@/lib/seo/attribution";

type TrackedNovelAiHomeLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "target" | "rel" | "children"
> & {
  children: React.ReactNode;
  sourceSlug: string;
  location?: OutboundLocation;
};

export function TrackedNovelAiHomeLink({
  children,
  className,
  sourceSlug,
  location = "seo_page",
  onClick,
  ...anchorProps
}: TrackedNovelAiHomeLinkProps) {
  const href = `/go/novelai/${encodeURIComponent(sourceSlug)}?location=${encodeURIComponent(location)}`;
  return (
    <a
      {...anchorProps}
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        track("novelai_home_click", {
          destination: "novelai_home",
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
