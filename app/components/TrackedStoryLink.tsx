"use client";

import { track } from "@vercel/analytics";

type TrackedStoryLinkProps = {
  children: React.ReactNode;
  className?: string;
  location: "hero" | "final_cta" | "seo_page";
  sourceSlug?: string;
};

const href = "/go/story/2000s-marriage-life-simulator";

export function TrackedStoryLink({
  children,
  className,
  location,
  sourceSlug,
}: TrackedStoryLinkProps) {
  return (
    <a
      className={className}
      href={href}
      onClick={() => {
        track("story_play_click", {
          story: "2000s Marriage Life Simulator",
          slug: "2000s-marriage-life-simulator",
          location,
          sourceSlug: sourceSlug ?? "homepage",
        });
      }}
    >
      {children}
    </a>
  );
}

