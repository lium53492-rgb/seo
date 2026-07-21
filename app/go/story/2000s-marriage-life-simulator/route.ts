import { redirect } from "next/navigation";

const storyUrl = "https://www.novelai.ai/zh-CN/";

export function GET(request: Request) {
  console.log(
    JSON.stringify({
      level: "info",
      event: "story_play_redirect",
      story: "2000s Marriage Life Simulator",
      slug: "2000s-marriage-life-simulator",
      referer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
    }),
  );

  redirect(storyUrl);
}

