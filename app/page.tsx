import { permanentRedirect } from "next/navigation";

const novelAiHomepage = "https://www.novelai.ai/zh-CN/";

/**
 * This domain is intentionally a collection of intent-specific SEO landing
 * pages. Visitors who reach the bare domain should continue directly to the
 * official product instead of entering a second, competing landing page.
 */
export default function Home() {
  permanentRedirect(novelAiHomepage);
}
