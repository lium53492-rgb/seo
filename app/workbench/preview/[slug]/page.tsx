import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { StoryCompanion } from "@/app/[slug]/StoryCompanion";
import { StructuredContentPage } from "@/app/[slug]/StructuredContentPage";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import {
  resolveCompanionPolicy,
  resolvePagePresentation,
  resolveRelatedSeoPages,
} from "@/lib/seo/page-presentation";
import { listPublishedPages } from "@/lib/seo/page-store";
import { readLatestReport } from "@/lib/seo/report-store";
import type { PublishedSeoPage } from "@/lib/seo/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Generated SEO Draft Preview",
  robots: { index: false, follow: false },
};

export default async function DraftPreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const requestHeaders = await headers();
  if (!isBasicAuthHeaderAuthorized(requestHeaders.get("authorization"))) {
    notFound();
  }

  const { slug } = await params;
  const report = await readLatestReport();
  const draft = report?.draft;
  if (!draft || draft.slug.replace(/^\//, "") !== slug) notFound();
  if (draft.schemaVersion !== 2 || !draft.architecture || !draft.signatureModule) notFound();

  const previewPage: PublishedSeoPage = {
    schemaVersion: 3,
    status: "published",
    slug,
    path: `/${slug}`,
    keyword: draft.keyword,
    publishedAt: draft.generatedAt,
    updatedAt: draft.generatedAt,
    generatedFromReport: report.id,
    draftDigest: report.publication?.draftDigest,
    pagePattern: report.contentStrategy?.pagePattern,
    architecture: draft.architecture,
    signatureModule: draft.signatureModule,
    title: draft.title,
    metaDescription: draft.metaDescription,
    h1: draft.h1,
    heroMarkdown: draft.heroMarkdown,
    primaryCta: draft.primaryCta,
    sections: draft.sections,
    faqs: draft.faqs,
    factIdsUsed: draft.factIdsUsed,
    internalLinks: draft.internalLinks,
    assetBriefs: draft.assetBriefs,
    quality: draft.quality,
    research: {
      opportunityScore: 0,
      demandProxy: 0,
      competitionProxy: 0,
      evidenceCount: report.evidence?.length ?? 0,
    },
  };
  const presentation = resolvePagePresentation(previewPage);
  if (!presentation) notFound();
  const relatedPages = resolveRelatedSeoPages(previewPage, await listPublishedPages());
  const companionPolicy = resolveCompanionPolicy(previewPage, presentation);

  return (
    <>
      <aside className="wb-preview-toolbar" aria-label="Draft preview controls">
        <a href="/workbench#generated">← 返回工作台</a>
        <div>
          <span className={`wb-mode-badge ${draft.status === "ready_for_review" ? "live" : "blocked"}`}>
            {draft.status === "ready_for_review" ? "READY FOR REVIEW" : "BLOCKED"}
          </span>
          <span>NOINDEX PREVIEW</span>
        </div>
      </aside>
      <StructuredContentPage
        page={previewPage}
        recipe={presentation}
        relatedPages={relatedPages}
        mode="preview"
      />
      {companionPolicy === "story_companion"
        ? <StoryCompanion sourceSlug={previewPage.slug} />
        : null}
    </>
  );
}
