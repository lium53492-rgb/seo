import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/go/", "/workbench/"],
    }],
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
