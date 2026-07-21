"use client";

import { track } from "@vercel/analytics";

type TrackedNovelAiHomeLinkProps = {
  children: React.ReactNode;
  className?: string;
  sourceSlug: string;
  location?: "homepage" | "seo_page";
};

const href = "https://www.novelai.ai/zh-CN/";

export function TrackedNovelAiHomeLink({
  children,
  className,
  sourceSlug,
  location = "seo_page",
}: TrackedNovelAiHomeLinkProps) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        track("novelai_home_click", {
          destination: "novelai_home",
          location,
          sourceSlug,
        });
      }}
    >
      {children}
    </a>
  );
}
