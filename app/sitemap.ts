import type { MetadataRoute } from "next";
import { listPublishedPages } from "@/lib/seo/page-store";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://seo-pi-fawn.vercel.app").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await listPublishedPages();
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    ...pages.map((page) => ({
      url: `${siteUrl}${page.path}`,
      lastModified: new Date(page.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
