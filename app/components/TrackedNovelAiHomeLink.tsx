"use client";

import { track } from "@vercel/analytics";

type TrackedNovelAiHomeLinkProps = {
  children: React.ReactNode;
  className?: string;
  sourceSlug: string;
};

const href = "https://www.novelai.ai/zh-CN/";

export function TrackedNovelAiHomeLink({
  children,
  className,
  sourceSlug,
}: TrackedNovelAiHomeLinkProps) {
  return (
    <a
      className={className}
      href={href}
      onClick={() => {
        track("novelai_home_click", {
          destination: "novelai_home",
          location: "seo_page",
          sourceSlug,
        });
      }}
    >
      {children}
    </a>
  );
}
