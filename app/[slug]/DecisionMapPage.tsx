import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";
import type { SeoPageViewProps } from "./page-family-types";
import { StoryMotionGallery } from "./StoryMotionGallery";
import styles from "./decision.module.css";

export function DecisionMapPage({ page, relatedPages }: SeoPageViewProps) {
  const routeStops = page.sections.slice(0, 4);

  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a href="/" className={styles.brand}><span>N</span>INTERACTIVE STORY MAP</a>
        <TrackedNovelAiHomeLink sourceSlug={page.slug} location="header">OPEN NOVELAI ↗</TrackedNovelAiHomeLink>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.coordinate}>ROUTE / VOICE / STORY</p>
          <h1>{page.h1}</h1>
          <p>{page.heroMarkdown}</p>
          <a className={styles.routeAction} href="#route">Trace the route ↓</a>
        </div>
        <div className={styles.map} aria-label="Abstract branching story route">
          <div className={styles.bubbleField} aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className={styles.mapLegend}><span><i /> Story context</span><span><i /> Your choice</span></div>
          <svg className={styles.routeRibbon} viewBox="0 0 700 560" aria-hidden="true">
            <path d="M92 102 C 240 30, 228 260, 370 210 S 512 94, 610 150" />
            <path d="M118 420 C 224 308, 286 520, 386 396 S 520 252, 626 416" />
            <path d="M350 70 C 280 178, 466 270, 350 492" />
          </svg>
          {routeStops.map((section, index) => <div key={section.heading} className={`${styles.node} ${styles[`node${index + 1}`]}`}><span>{index + 1}</span><strong>{section.heading}</strong></div>)}
          <div className={styles.destination}><span>VOICE</span><strong>You enter here</strong></div>
        </div>
      </header>

      <section className={styles.route} id="route" aria-labelledby="route-heading">
        <header><span>ROUTE NOTES</span><h2 id="route-heading">Every stop changes what the next line means.</h2></header>
        <div className={styles.routeList}>
          {page.sections.map((section, index) => <article key={section.heading}><div className={styles.marker}>{String(index + 1).padStart(2, "0")}</div><div><h3>{section.heading}</h3><p>{section.bodyMarkdown}</p></div></article>)}
        </div>
      </section>

      <StoryMotionGallery />

      <section className={styles.edgeCases} aria-labelledby="decision-faq-heading">
        <div><span>EDGE CASES</span><h2 id="decision-faq-heading">What if the route is not obvious?</h2></div>
        <div>{page.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<span>+</span></summary><p>{faq.answerMarkdown}</p></details>)}</div>
      </section>

      {relatedPages.length > 0 ? <aside className={styles.nextRoutes} aria-labelledby="decision-related-heading"><header><span>CONNECTED ROUTES</span><h2 id="decision-related-heading">Keep mapping the experience.</h2></header><div>{relatedPages.map((link, index) => <a key={link.href} href={link.href}><span>0{index + 1}</span><strong>{link.anchor}</strong><small>{link.target.metaDescription}</small></a>)}</div></aside> : null}

      <footer className={styles.destinationCta}><span>DESTINATION</span><h2>The route ends inside the story.</h2><TrackedNovelAiHomeLink sourceSlug={page.slug} location="final_cta">Explore stories on NovelAI ↗</TrackedNovelAiHomeLink></footer>
    </main>
  );
}
