import Image from "next/image";
import { TrackedPlayworldsLink } from "@/app/components/TrackedPlayworldsLink";
import type { SeoPageViewProps } from "./page-family-types";
import { StageStarterSelector } from "./StageStarterSelector";
import styles from "./stage-decision.module.css";

export function StageDecisionPage({ page, relatedPages }: SeoPageViewProps) {
  return (
    <main className={styles.stage}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="#decision">P <span>PLAYWORLDS GUIDES</span></a>
        <TrackedPlayworldsLink className={styles.navLink} sourceSlug={page.slug} location="header">VIEW PLAYWORLDS ↗</TrackedPlayworldsLink>
      </nav>

      <header className={styles.hero}>
        <Image
          className={styles.heroImage}
          src="/story-scenes/stage-choice.webp"
          alt="An original theatrical scene with a performer, split curtains, and two ways into a story."
          fill
          priority
          sizes="100vw"
        />
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroContent}>
          <p className={styles.kicker}>PROMPT FIRST / STORY FIRST</p>
          <h1>{page.h1}</h1>
          <p className={styles.answer}>{page.heroMarkdown}</p>
          <div className={styles.fork} aria-label="Jump to a comparison route">
            <a href="#starter-selector"><span>01</span> Find your cue</a>
            <a href="#route-stop-3"><span>02</span> Perform the scene</a>
          </div>
          <TrackedPlayworldsLink className={styles.heroCta} sourceSlug={page.slug} location="hero">View Playworlds on Steam <span aria-hidden="true">↗</span></TrackedPlayworldsLink>
        </div>
        <p className={styles.cue} aria-hidden="true">SCENE CUE — A beginning is already moving.</p>
      </header>

      <StageStarterSelector sourceSlug={page.slug} />

      <section className={styles.decision} id="decision" aria-labelledby="decision-heading">
        <header>
          <p>ACT I / THE CHOICE</p>
          <h2 id="decision-heading">Do you want to set the scene, or step into it?</h2>
        </header>
        <div className={styles.routeList}>
          {page.sections.map((section, index) => (
            <article id={`route-stop-${index + 1}`} key={section.heading}>
              <p className={styles.routeIndex}>{String(index + 1).padStart(2, "0")}</p>
              <div>
                <h3>{section.heading}</h3>
                <p>{section.bodyMarkdown}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.intermission} aria-labelledby="intermission-heading">
        <div>
          <p>INTERMISSION</p>
          <h2 id="intermission-heading">The best starting point is the one that gives you something to do next.</h2>
        </div>
        <div className={styles.faqs}>
          {page.faqs.map((faq, index) => (
            <details key={faq.question}>
              <summary><span>{String(index + 1).padStart(2, "0")}</span>{faq.question}<b>+</b></summary>
              <p>{faq.answerMarkdown}</p>
            </details>
          ))}
        </div>
      </section>

      {relatedPages.length > 0 ? (
        <aside className={styles.related} aria-labelledby="related-heading">
          <header><p>NEXT ON STAGE</p><h2 id="related-heading">Choose the next question, not another version of the same one.</h2></header>
          <div>
            {relatedPages.map((link, index) => (
              <a key={link.href} href={link.href}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{link.anchor}</strong>
                <small>{link.target.metaDescription}</small>
              </a>
            ))}
          </div>
        </aside>
      ) : null}

      <footer className={styles.finalCta}>
        <p>CURTAIN UP</p>
        <h2>The comparison ends where the story begins.</h2>
        <TrackedPlayworldsLink className={styles.finalLink} sourceSlug={page.slug} location="final_cta">View Playworlds on Steam ↗</TrackedPlayworldsLink>
      </footer>
    </main>
  );
}
