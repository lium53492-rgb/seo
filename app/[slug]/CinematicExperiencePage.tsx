import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";
import type { SeoPageViewProps } from "./page-family-types";
import { StoryMotionGallery } from "./StoryMotionGallery";
import styles from "./cinematic.module.css";

export function CinematicExperiencePage({ page, relatedPages }: SeoPageViewProps) {
  return (
    <main className={styles.shell}>
      <div className={styles.particleField} aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
      </div>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="/"><span>N</span>NovelAI Stories</a>
        <TrackedNovelAiHomeLink className={styles.navAction} sourceSlug={page.slug} location="header">
          Explore NovelAI <span aria-hidden="true">↗</span>
        </TrackedNovelAiHomeLink>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Story-first AI voice roleplay</p>
          <h1>{page.h1}</h1>
          <p className={styles.lede}>{page.heroMarkdown}</p>
          <div className={styles.actions}>
            <TrackedNovelAiHomeLink className={styles.primaryAction} sourceSlug={page.slug} location="hero">
              Explore stories on NovelAI
            </TrackedNovelAiHomeLink>
            <a className={styles.secondaryAction} href="#inside-the-scene">Enter the scene</a>
          </div>
        </div>

        <div className={styles.stage} aria-label="Abstract original story role selection illustration">
          <div className={styles.playOrbit} aria-hidden="true"><span>STORY</span><span>ROLE</span><span>VOICE</span></div>
          <div className={styles.stageHeader}><span><i /> Scene in progress</span><small>01 / 03</small></div>
          <div className={styles.storyCard}><span>01</span><strong>Enter the story</strong><small>An existing plot gives the scene a clear beginning.</small></div>
          <p className={styles.sceneNote}>A scene is already in motion.<br />Choose where you enter.</p>
          <div className={`${styles.roleCard} ${styles.roleOne}`}><span>A</span><strong>Choose a role</strong></div>
          <div className={`${styles.roleCard} ${styles.roleTwo}`}><span>B</span><strong>Perform the scene</strong></div>
          <div className={styles.voiceLine} aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
        </div>
      </header>

      <section className={styles.chapters} id="inside-the-scene" aria-labelledby="inside-heading">
        <div className={styles.chapterIntro}>
          <p className={styles.eyebrow}>Inside the experience</p>
          <h2 id="inside-heading">Plot. Role. Performance.</h2>
        </div>
        <div className={styles.chapterList}>
          {page.sections.map((section, index) => (
            <article key={section.heading}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h3>{section.heading}</h3><p>{section.bodyMarkdown}</p></div>
            </article>
          ))}
        </div>
      </section>

      <StoryMotionGallery />

      <section className={styles.questions} aria-labelledby="cinematic-faq-heading">
        <div><p className={styles.eyebrow}>Before the first line</p><h2 id="cinematic-faq-heading">Questions from the wings</h2></div>
        <div className={styles.faqList}>
          {page.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answerMarkdown}</p></details>)}
        </div>
      </section>

      {relatedPages.length > 0 ? (
        <aside className={styles.related} aria-labelledby="cinematic-related-heading">
          <p className={styles.eyebrow}>Next scene</p>
          <h2 id="cinematic-related-heading">Follow the question that comes next.</h2>
          <div>{relatedPages.map((link, index) => <a key={link.href} href={link.href}><small>Scene {String(index + 2).padStart(2, "0")}</small><strong>{link.anchor}</strong><span>↗</span></a>)}</div>
        </aside>
      ) : null}

      <footer className={styles.finalCta}>
        <p className={styles.eyebrow}>The stage is set</p><h2>Choose a character and enter the scene.</h2>
        <TrackedNovelAiHomeLink className={styles.primaryAction} sourceSlug={page.slug} location="final_cta">Explore stories on NovelAI</TrackedNovelAiHomeLink>
      </footer>
    </main>
  );
}
