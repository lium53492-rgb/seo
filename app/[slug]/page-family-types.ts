import type { RelatedSeoPage } from "@/lib/seo/page-presentation";
import type { PublishedSeoPage } from "@/lib/seo/types";

export type SeoPageViewProps = {
  page: PublishedSeoPage;
  relatedPages: RelatedSeoPage[];
};
