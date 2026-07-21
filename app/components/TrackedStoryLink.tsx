"use client";

import { track } from "@vercel/analytics";

type TrackedStoryLinkProps = {
  children: React.ReactNode;
  className?: string;
  location: "hero" | "final_cta" | "seo_page";
  sourceSlug?: string;
};

const href = "https://www.novelai.ai/zh-CN/";

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
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        track("novelai_home_click", {
          destinationContext: "legacy_story_link",
          destination: "novelai_home",
          location,
          sourceSlug: sourceSlug ?? "homepage",
        });
      }}
    >
      {children}
    </a>
  );
}

