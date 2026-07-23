import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";
import type { SeoPageViewProps } from "./page-family-types";
import { StoryMotionGallery } from "./StoryMotionGallery";
import styles from "./guide.module.css";

export function TaskGuidePage({ page, relatedPages }: SeoPageViewProps) {
  return (
    <main className={styles.shell} id="top">
      <nav className={styles.nav} aria-label="Primary navigation">
        <a href="/" className={styles.brand}><span>N</span><strong>Role Selection Field Guide</strong></a>
        <span>Director&apos;s copy · 01</span>
      </nav>

      <header className={styles.hero}>
        <div className={styles.foldTrail} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.folio}><span>FIELD NOTE</span><strong>01</strong><small>For readers standing at the edge of a scene</small></div>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>A practical guide to finding your point of view</p>
          <h1>{page.h1}</h1>
          <p className={styles.lede}>{page.heroMarkdown}</p>
        </div>
        <aside className={styles.marginNote}>
          <span>THE SHORT ANSWER</span>
          <p>Begin with the story, inspect the available roles, then choose the point of view you want to perform.</p>
          <a href="#guide">Mark the steps ↓</a>
        </aside>
      </header>

      <section className={styles.guide} id="guide">
        <aside className={styles.contents} aria-label="On this page">
          <span>ON THIS PAGE</span>
          <ol>{page.sections.map((section, index) => <li key={section.heading}><a href={`#step-${index + 1}`}><b>{String(index + 1).padStart(2, "0")}</b>{section.heading}</a></li>)}</ol>
        </aside>
        <div className={styles.steps}>
          {page.sections.map((section, index) => (
            <article id={`step-${index + 1}`} key={section.heading}>
              <div className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</div>
              <div><p className={styles.pencil}>Director&apos;s note</p><h2>{section.heading}</h2><p>{section.bodyMarkdown}</p></div>
            </article>
          ))}
          <div className={styles.actionNote}>
            <span>WHEN YOU ARE READY</span>
            <div><h2>Carry the choice into a real story.</h2><p>The guide ends where the scene begins.</p></div>
            <TrackedNovelAiHomeLink sourceSlug={page.slug} location="inline">Explore stories on NovelAI ↗</TrackedNovelAiHomeLink>
          </div>
        </div>
      </section>

      <StoryMotionGallery />

      <section className={styles.questions} aria-labelledby="guide-faq-heading">
        <div className={styles.questionHeading}><span>BACK POCKET NOTES</span><h2 id="guide-faq-heading">Questions worth checking before you begin</h2></div>
        <div className={styles.questionList}>{page.faqs.map((faq, index) => <details key={faq.question}><summary><span>Q{index + 1}</span>{faq.question}</summary><p>{faq.answerMarkdown}</p></details>)}</div>
      </section>

      {relatedPages.length > 0 ? (
        <aside className={styles.footnotes} aria-labelledby="guide-related-heading">
          <h2 id="guide-related-heading">Continue in the margins</h2>
          {relatedPages.map((link, index) => <a key={link.href} href={link.href}><sup>{index + 1}</sup><span><strong>{link.anchor}</strong><small>{link.target.metaDescription}</small></span></a>)}
        </aside>
      ) : null}

      <footer className={styles.footer}><span>END OF FIELD NOTE 01</span><a href="#top" aria-label="Return to the top of the page">Back to top ↑</a></footer>
    </main>
  );
}
