import { buildGuidesRobotsText } from "../../../lib/seo/guides-robots.mjs";
import { absoluteSiteUrl, getSiteBasePath } from "../../../lib/seo/site";

export const dynamic = "force-static";

export function GET() {
  const publicBasePath = getSiteBasePath();
  const body = buildGuidesRobotsText(
    publicBasePath,
    absoluteSiteUrl("/sitemap.xml"),
  );

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
