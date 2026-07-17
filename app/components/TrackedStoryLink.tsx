"use client";

import { track } from "@vercel/analytics";

type TrackedStoryLinkProps = {
  children: React.ReactNode;
  className?: string;
  location: "hero" | "final_cta";
};

const href = "/go/story/2000s-marriage-life-simulator";

export function TrackedStoryLink({
  children,
  className,
  location,
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
        });
      }}
    >
      {children}
    </a>
  );
}

