import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackedStoryLink } from "@/app/components/TrackedStoryLink";
import { listPublishedPages, readPublishedPage } from "@/lib/seo/page-store";
import styles from "./page.module.css";

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

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: page.h1,
        description: page.metaDescription,
        datePublished: page.publishedAt,
        dateModified: page.updatedAt,
        mainEntityOfPage: page.path,
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answerMarkdown,
          },
        })),
      },
    ],
  };

  return (
    <main className={styles.shell}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="/">
          <span>N</span>
          NovelAI Stories
        </a>
        <a href="/#story-preview">Explore a playable story</a>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Story-first AI voice roleplay</p>
          <h1>{page.h1}</h1>
          <p className={styles.lede}>{page.heroMarkdown}</p>
          <div className={styles.actions}>
            <TrackedStoryLink
              className={styles.primaryAction}
              location="seo_page"
              sourceSlug={page.slug}
            >
              {page.primaryCta}
            </TrackedStoryLink>
            <a className={styles.secondaryAction} href="#how-it-works">
              See how it works
            </a>
          </div>
        </div>

        <div className={styles.stage} aria-label="Abstract original story role selection illustration">
          <div className={styles.storyCard}>
            <span>01</span>
            <strong>Enter the story</strong>
            <small>An existing plot gives the scene a clear beginning.</small>
          </div>
          <div className={`${styles.roleCard} ${styles.roleOne}`}><span>A</span><strong>Choose a role</strong></div>
          <div className={`${styles.roleCard} ${styles.roleTwo}`}><span>B</span><strong>Perform the scene</strong></div>
          <div className={styles.voiceLine} aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
        </div>
      </header>

      <section className={styles.body} id="how-it-works">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Inside the experience</p>
          <h2>A defined story, a role you choose, and a scene you can perform.</h2>
        </div>
        <div className={styles.sectionGrid}>
          {page.sections.map((section, index) => (
            <article key={section.heading} className={styles.sectionCard}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{section.heading}</h3>
                <p>{section.bodyMarkdown}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.faq}>
        <div>
          <p className={styles.eyebrow}>Questions, answered</p>
          <h2>Before you choose a role</h2>
        </div>
        <div className={styles.faqList}>
          {page.faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answerMarkdown}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className={styles.finalCta}>
        <p className={styles.eyebrow}>Ready for a story?</p>
        <h2>Choose a character and enter the scene.</h2>
        <p>
          Start with a playable interactive story while the voice-roleplay
          experience continues to grow.
        </p>
        <TrackedStoryLink
          className={styles.primaryAction}
          location="seo_page"
          sourceSlug={page.slug}
        >
          Explore the story
        </TrackedStoryLink>
      </footer>
    </main>
  );
}
