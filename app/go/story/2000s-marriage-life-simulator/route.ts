import { redirect } from "next/navigation";

const storyUrl = "https://www.novelai.ai/zh-CN/";

export function GET() {
  console.log(
    JSON.stringify({
      level: "info",
      event: "legacy_story_redirect",
      destination: "novelai_home",
    }),
  );

  redirect(storyUrl);
}

