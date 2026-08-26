import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleJsonLd, FAQJsonLd } from "next-seo";
import { listPublishedPages, readPublishedPage } from "@/lib/seo/page-store";
import {
  resolveRelatedSeoPages,
  resolveCompanionPolicy,
  resolvePagePresentation,
  resolveSeoPageFamily,
} from "@/lib/seo/page-presentation";
import { absoluteSiteUrl } from "@/lib/seo/site";
import { CinematicExperiencePage } from "./CinematicExperiencePage";
import { DecisionMapPage } from "./DecisionMapPage";
import { InventoryCatalogPage } from "./InventoryCatalogPage";
import { LandingViewBeacon } from "./LandingViewBeacon";
import { NarrativeEssayPage } from "./NarrativeEssayPage";
import { TaskGuidePage } from "./TaskGuidePage";
import { StoryCompanion } from "./StoryCompanion";
import { StructuredContentPage } from "./StructuredContentPage";

type PageProps = { params: Promise<{ slug: string }> };

const pageHeroImages = {
  "ai-game-master-vs-chatbot-for-tabletop-campaign": {
    path: "/story-scenes/campaign-keeper-v1.webp",
    alt: "An original dark-fantasy campaign keeper framed by fog and an ember-lit ritual circle.",
    width: 1672,
    height: 941,
  },
} as const;

function pageHeroImage(slug: string) {
  return pageHeroImages[slug as keyof typeof pageHeroImages];
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await listPublishedPages()).map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = await readPublishedPage((await params).slug);
  if (!page) return {};
  const heroImage = pageHeroImage(page.slug);
  const absoluteHeroImage = heroImage ? absoluteSiteUrl(heroImage.path) : undefined;
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
      ...(heroImage && absoluteHeroImage
        ? {
            images: [{
              url: absoluteHeroImage,
              width: heroImage.width,
              height: heroImage.height,
              alt: heroImage.alt,
            }],
          }
        : {}),
    },
    ...(heroImage && absoluteHeroImage
      ? {
          twitter: {
            card: "summary_large_image",
            title: page.title,
            description: page.metaDescription,
            images: [{ url: absoluteHeroImage, alt: heroImage.alt }],
          },
        }
      : {}),
  };
}

export default async function PublishedSeoPage({ params }: PageProps) {
  const page = await readPublishedPage((await params).slug);
  if (!page) notFound();

  const publishedPages = await listPublishedPages();
  const relatedPages = resolveRelatedSeoPages(page, publishedPages);

  const canonicalUrl = absoluteSiteUrl(page.path);
  const heroImage = pageHeroImage(page.slug);
  const absoluteHeroImage = heroImage ? absoluteSiteUrl(heroImage.path) : undefined;

  const presentation = resolvePagePresentation(page);
  const companionPolicy = resolveCompanionPolicy(page, presentation);
  const family = resolveSeoPageFamily(page);
  const legacyView = (() => {
    switch (family) {
      case "task_guide": return <TaskGuidePage page={page} relatedPages={relatedPages} />;
      case "decision_page": return <DecisionMapPage page={page} relatedPages={relatedPages} />;
      case "narrative_essay": return <NarrativeEssayPage page={page} relatedPages={relatedPages} />;
      case "original_inventory": return <InventoryCatalogPage page={page} relatedPages={relatedPages} />;
      case "experience_explainer": return <CinematicExperiencePage page={page} relatedPages={relatedPages} />;
    }
  })();
  const view = presentation
    ? <StructuredContentPage page={page} recipe={presentation} relatedPages={relatedPages} />
    : legacyView;

  return (
    <>
      <ArticleJsonLd
        type="Article"
        headline={page.h1}
        description={page.metaDescription}
        url={canonicalUrl}
        mainEntityOfPage={canonicalUrl}
        datePublished={page.publishedAt}
        dateModified={page.updatedAt}
        image={heroImage && absoluteHeroImage
          ? {
              "@type": "ImageObject",
              url: absoluteHeroImage,
              width: heroImage.width,
              height: heroImage.height,
              caption: heroImage.alt,
            }
          : undefined}
        scriptId={`article-jsonld-${page.slug}`}
      />
      <FAQJsonLd
        questions={page.faqs.map((faq) => ({
          question: faq.question,
          answer: faq.answerMarkdown,
        }))}
        scriptId={`faq-jsonld-${page.slug}`}
      />
      {view}
      <LandingViewBeacon sourceSlug={page.slug} />
      {companionPolicy === "story_companion"
        ? <StoryCompanion sourceSlug={page.slug} />
        : null}
    </>
  );
}
