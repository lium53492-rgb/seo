import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";
import type { SeoPageViewProps } from "./page-family-types";
import { StoryMotionGallery } from "./StoryMotionGallery";
import styles from "./essay.module.css";

export function NarrativeEssayPage({ page, relatedPages }: SeoPageViewProps) {
  return (
    <main className={styles.shell}>
      <nav className={styles.masthead} aria-label="Primary navigation">
        <a href="/"><span>THE</span><strong>STORY ROLEPLAY REVIEW</strong></a>
        <p>ESSAY No. 04 · NOVELAI STORY GUIDE</p>
      </nav>

      <header className={styles.hero}>
        <div className={styles.collage} aria-hidden="true"><i /><i /><i /><i /></div>
        <p className={styles.sectionLabel}>IDEAS / STORY CONTEXT</p>
        <h1>{page.h1}</h1>
        <div className={styles.deck}><p>{page.heroMarkdown}</p><aside><span>READING TIME</span><strong>{Math.max(4, page.sections.length + 1)} MIN</strong><small>One argument, five chapters</small></aside></div>
      </header>

      <section className={styles.opening}>
        <div className={styles.dropQuote}><span>“</span><p>A place, a moment, and a role to inhabit.</p></div>
        <p className={styles.byline}>A reading-led explanation of why story context changes the first line.</p>
      </section>

      <article className={styles.essay}>
        {page.sections.map((section, index) => <section key={section.heading}><aside><span>CHAPTER</span><strong>{String(index + 1).padStart(2, "0")}</strong></aside><div><h2>{section.heading}</h2><p>{section.bodyMarkdown}</p>{index === 1 ? <blockquote>The role is not decoration. It is the point of view that makes the scene playable.</blockquote> : null}</div></section>)}
      </article>

      <StoryMotionGallery />

      <section className={styles.questions} aria-labelledby="essay-faq-heading">
        <header><span>BACK MATTER</span><h2 id="essay-faq-heading">Questions the argument should answer</h2></header>
        <div>{page.faqs.map((faq, index) => <details key={faq.question}><summary><span>{String(index + 1).padStart(2, "0")}</span>{faq.question}</summary><p>{faq.answerMarkdown}</p></details>)}</div>
      </section>

      {relatedPages.length > 0 ? <aside className={styles.readingList} aria-labelledby="essay-related-heading"><span>FURTHER READING</span><h2 id="essay-related-heading">The next essay starts with a different question.</h2><div>{relatedPages.map((link) => <a key={link.href} href={link.href}><strong>{link.anchor}</strong><small>{link.target.metaDescription}</small><span>Read next ↗</span></a>)}</div></aside> : null}

      <footer className={styles.finalCta}><p>THE END / THE SCENE BEGINS</p><h2>Move from the argument into the story.</h2><TrackedNovelAiHomeLink sourceSlug={page.slug}>Explore stories on NovelAI ↗</TrackedNovelAiHomeLink></footer>
    </main>
  );
}
