import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { StructuredContentPage } from "@/app/[slug]/StructuredContentPage";
import { aiGameMasterVsChatbotPreviewPage } from "@/components/seo/ai-game-master-vs-chatbot/preview-page";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import { resolvePagePresentation } from "@/lib/seo/page-presentation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${aiGameMasterVsChatbotPreviewPage.title} - Concept Preview`,
  description: aiGameMasterVsChatbotPreviewPage.metaDescription,
  openGraph: {
    title: aiGameMasterVsChatbotPreviewPage.title,
    description: aiGameMasterVsChatbotPreviewPage.metaDescription,
    url: aiGameMasterVsChatbotPreviewPage.path,
    siteName: "Playworlds",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: aiGameMasterVsChatbotPreviewPage.title,
    description: aiGameMasterVsChatbotPreviewPage.metaDescription,
  },
  robots: { index: false, follow: false, nocache: true },
};

export default async function AiGameMasterVsChatbotConceptRoute() {
  const requestHeaders = await headers();
  if (!isBasicAuthHeaderAuthorized(requestHeaders.get("authorization"))) notFound();

  const presentation = resolvePagePresentation(aiGameMasterVsChatbotPreviewPage);
  if (!presentation) notFound();

  return (
    <StructuredContentPage
      page={aiGameMasterVsChatbotPreviewPage}
      recipe={presentation}
      relatedPages={[]}
      mode="preview"
    />
  );
}
