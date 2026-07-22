import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPublishedPages, readPublishedPage } from "@/lib/seo/page-store";
import { resolveSeoPageFamily } from "@/lib/seo/page-presentation";
import { CinematicExperiencePage } from "./CinematicExperiencePage";
import { DecisionMapPage } from "./DecisionMapPage";
import { InventoryCatalogPage } from "./InventoryCatalogPage";
import { NarrativeEssayPage } from "./NarrativeEssayPage";
import { TaskGuidePage } from "./TaskGuidePage";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await listPublishedPages()).map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = await readPublishedPage((await params).slug);
  if (!page) return {};
  return {
    title: page.title,
    description: page.metaDescription,
    alternates: { canonical: page.path },
    openGraph: {
      title: page.title,
      description: page.metaDescription,
      url: page.path,
      type: "article",
      publishedTime: page.publishedAt,
      modifiedTime: page.updatedAt,
    },
  };
}

export default async function PublishedSeoPage({ params }: PageProps) {
  const page = await readPublishedPage((await params).slug);
  if (!page) notFound();

  const publishedPages = await listPublishedPages();
  const relatedPages = page.internalLinks.flatMap((link) => {
    if (link.href === "/" || link.href === page.path) return [];
    const target = publishedPages.find((candidate) => candidate.path === link.href);
    return target ? [{ ...link, target }] : [];
  });

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", headline: page.h1, description: page.metaDescription, datePublished: page.publishedAt, dateModified: page.updatedAt, mainEntityOfPage: page.path },
      { "@type": "FAQPage", mainEntity: page.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answerMarkdown } })) },
    ],
  };

  const family = resolveSeoPageFamily(page);
  const view = (() => {
    switch (family) {
      case "task_guide": return <TaskGuidePage page={page} relatedPages={relatedPages} />;
      case "decision_page": return <DecisionMapPage page={page} relatedPages={relatedPages} />;
      case "narrative_essay": return <NarrativeEssayPage page={page} relatedPages={relatedPages} />;
      case "original_inventory": return <InventoryCatalogPage page={page} relatedPages={relatedPages} />;
      case "experience_explainer": return <CinematicExperiencePage page={page} relatedPages={relatedPages} />;
    }
  })();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {view}
    </>
  );
}
