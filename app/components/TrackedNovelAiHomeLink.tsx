"use client";

import { track } from "@vercel/analytics";

type TrackedNovelAiHomeLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "target" | "rel" | "children"
> & {
  children: React.ReactNode;
  sourceSlug: string;
  location?: "homepage" | "seo_page";
};

const href = "https://www.novelai.ai/zh-CN/";

export function TrackedNovelAiHomeLink({
  children,
  className,
  sourceSlug,
  location = "seo_page",
  onClick,
  ...anchorProps
}: TrackedNovelAiHomeLinkProps) {
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
