import type { MetadataRoute } from "next";
import { listPublishedPages } from "@/lib/seo/page-store";
import { absoluteSiteUrl, getSiteUrl } from "@/lib/seo/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await listPublishedPages();
  return [
    {
      url: getSiteUrl().origin,
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    ...pages.map((page) => ({
      url: absoluteSiteUrl(page.path),
      lastModified: new Date(page.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
