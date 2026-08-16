import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { StructuredContentPage } from "@/app/[slug]/StructuredContentPage";
import { storyDrivenAdventurePreviewPage } from "@/components/seo/story-driven-adventure/preview-page";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import { resolvePagePresentation } from "@/lib/seo/page-presentation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${storyDrivenAdventurePreviewPage.title} - Concept Preview`,
  description: storyDrivenAdventurePreviewPage.metaDescription,
  openGraph: {
    title: storyDrivenAdventurePreviewPage.title,
    description: storyDrivenAdventurePreviewPage.metaDescription,
    url: storyDrivenAdventurePreviewPage.path,
    siteName: "Playworlds",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: storyDrivenAdventurePreviewPage.title,
    description: storyDrivenAdventurePreviewPage.metaDescription,
  },
  robots: { index: false, follow: false, nocache: true },
};

export default async function StoryDrivenAdventureConceptRoute() {
  const requestHeaders = await headers();
  if (!isBasicAuthHeaderAuthorized(requestHeaders.get("authorization"))) {
    notFound();
  }

  const presentation = resolvePagePresentation(storyDrivenAdventurePreviewPage);
  if (!presentation) notFound();

  return (
    <StructuredContentPage
      page={storyDrivenAdventurePreviewPage}
      recipe={presentation}
      relatedPages={[]}
      mode="preview"
    />
  );
}
