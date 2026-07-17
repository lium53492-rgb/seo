import { redirect } from "next/navigation";

const storyUrl =
  "https://www.novelai.ai/story/9b61e7e9-772c-44ad-b318-5f76db9c993a/episode/bd7eaf4e-a4d7-411f-a71b-f2fb4216b410?progression=guided&scenarioId=scenario-1&preventRepeatChoices=1";

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

