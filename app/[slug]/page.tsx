import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";
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
        <div className={styles.brand}>
          <span>N</span>
          NovelAI Stories
        </div>
        <TrackedNovelAiHomeLink className={styles.navAction} sourceSlug={page.slug}>
          Explore NovelAI <span aria-hidden="true">↗</span>
        </TrackedNovelAiHomeLink>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Story-first AI voice roleplay</p>
          <h1>{page.h1}</h1>
          <p className={styles.lede}>{page.heroMarkdown}</p>
          <div className={styles.actions}>
            <TrackedNovelAiHomeLink
              className={styles.primaryAction}
              sourceSlug={page.slug}
            >
              Explore stories on NovelAI
            </TrackedNovelAiHomeLink>
            <span className={styles.ctaNote}>Opens NovelAI in a new tab</span>
            <a className={styles.secondaryAction} href="#how-it-works">
              See how it works
            </a>
          </div>
        </div>

        <div className={styles.stage} aria-label="Abstract original story role selection illustration">
          <div className={styles.stageHeader}>
            <span><i /> Story context</span>
            <small>01 / 03</small>
          </div>
          <div className={styles.storyCard}>
            <span>01</span>
            <strong>Enter the story</strong>
            <small>An existing plot gives the scene a clear beginning.</small>
          </div>
          <p className={styles.sceneNote}>A scene is already in motion.<br />Choose where you enter.</p>
          <div className={`${styles.roleCard} ${styles.roleOne}`}><span>A</span><strong>Choose a role</strong></div>
          <div className={`${styles.roleCard} ${styles.roleTwo}`}><span>B</span><strong>Perform the scene</strong></div>
          <div className={styles.voiceLine} aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
        </div>
      </header>

      <section className={styles.body} id="how-it-works">
        <div className={styles.startPanel}>
          <div>
            <p className={styles.eyebrow}>Start with a scene, not a blank prompt</p>
            <h2>See the path before you decide to leave this page.</h2>
          </div>
          <ol>
            <li><span>01</span><strong>Open a story</strong><p>Begin from an existing premise instead of inventing everything first.</p></li>
            <li><span>02</span><strong>Choose an available role</strong><p>Use a character&apos;s point of view to give the first scene direction.</p></li>
            <li><span>03</span><strong>Enter the scene</strong><p>Carry the opening situation into the way you perform the role.</p></li>
          </ol>
          <TrackedNovelAiHomeLink className={styles.panelAction} sourceSlug={page.slug}>
            Open NovelAI to explore stories
          </TrackedNovelAiHomeLink>
        </div>
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
          Continue on the official NovelAI homepage.
        </p>
        <TrackedNovelAiHomeLink
          className={styles.primaryAction}
          sourceSlug={page.slug}
        >
          Explore stories on NovelAI
        </TrackedNovelAiHomeLink>
      </footer>
    </main>
  );
}
