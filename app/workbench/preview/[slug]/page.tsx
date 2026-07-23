import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { MessageResponse } from "@/components/ai-elements/message";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import { productFacts } from "@/lib/seo/product-facts";
import { readLatestReport } from "@/lib/seo/report-store";

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

  const factMap = new Map(productFacts.map((fact) => [fact.id, fact]));

  return (
    <main className="wb-preview-shell">
      <header className="wb-preview-toolbar">
        <a href="/workbench#generated">← 返回工作台</a>
        <div>
          <span className={`wb-mode-badge ${draft.status === "ready_for_review" ? "live" : "blocked"}`}>
            {draft.status === "ready_for_review" ? "READY FOR REVIEW" : "BLOCKED"}
          </span>
          <span>NOINDEX PREVIEW</span>
        </div>
      </header>

      <article className="wb-preview-page">
        <section className="wb-preview-hero">
          <p className="wb-kicker">AI VOICE ROLEPLAY</p>
          <MessageResponse className="wb-preview-h1">{draft.h1}</MessageResponse>
          <MessageResponse className="wb-preview-lede">{draft.heroMarkdown}</MessageResponse>
          <a
            className="wb-preview-cta"
            href="https://www.novelai.ai/zh-CN/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageResponse>{draft.primaryCta}</MessageResponse>
          </a>
        </section>

        <section className="wb-preview-content">
          {draft.sections.map((section) => (
            <div className="wb-preview-section" key={section.heading}>
              <MessageResponse className="wb-preview-h2">{section.heading}</MessageResponse>
              <MessageResponse>{section.bodyMarkdown}</MessageResponse>
            </div>
          ))}
        </section>

        <section className="wb-preview-faq">
          <p className="wb-kicker">FAQ</p>
          {draft.faqs.map((faq) => (
            <article key={faq.question}>
              <MessageResponse>{faq.question}</MessageResponse>
              <MessageResponse>{faq.answerMarkdown}</MessageResponse>
            </article>
          ))}
        </section>

        <section className="wb-preview-audit">
          <div>
            <p className="wb-kicker">APPROVED FACTS USED</p>
            {draft.factIdsUsed.map((id) => (
              <article key={id}>
                <MessageResponse>{id}</MessageResponse>
                <p>{factMap.get(id)?.statement ?? "Unknown fact ID — blocked for review"}</p>
                <small>{factMap.get(id)?.source}</small>
              </article>
            ))}
          </div>
          <div>
            <p className="wb-kicker">ORIGINAL ASSET BRIEFS</p>
            {draft.assetBriefs.map((brief) => (
              <MessageResponse className="wb-asset-brief" key={brief}>{brief}</MessageResponse>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}
