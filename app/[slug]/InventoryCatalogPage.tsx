import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";
import type { SeoPageViewProps } from "./page-family-types";
import styles from "./inventory.module.css";

export function InventoryCatalogPage({ page, relatedPages }: SeoPageViewProps) {
  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Primary navigation"><a href="/"><span>N</span>ORIGINAL STORY INDEX</a><small>CATALOG / 2026</small></nav>
      <header className={styles.hero}><div className={styles.catalogBubbles} aria-hidden="true"><i /><i /><i /><i /></div><div><span>FIRST-PARTY STORY NOTES</span><h1>{page.h1}</h1></div><p>{page.heroMarkdown}</p></header>
      <section className={styles.catalog} aria-label="Original story content index">
        <header><span>INDEX</span><span>{String(page.sections.length).padStart(2, "0")} ENTRIES</span></header>
        {page.sections.map((section, index) => <article key={section.heading}><span>{String(index + 1).padStart(3, "0")}</span><div><h2>{section.heading}</h2><p>{section.bodyMarkdown}</p></div><small>STORY NOTE</small></article>)}
      </section>
      <section className={styles.questions} aria-labelledby="inventory-faq-heading"><header><span>CATALOG NOTES</span><h2 id="inventory-faq-heading">Before opening an entry</h2></header><div>{page.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answerMarkdown}</p></details>)}</div></section>
      {relatedPages.length > 0 ? <aside className={styles.related} aria-labelledby="inventory-related-heading"><h2 id="inventory-related-heading">Adjacent shelves</h2>{relatedPages.map((link) => <a key={link.href} href={link.href}><span>{link.anchor}</span><small>↗</small></a>)}</aside> : null}
      <footer className={styles.footer}><h2>Open the story, then choose where to enter.</h2><TrackedNovelAiHomeLink sourceSlug={page.slug}>Explore stories on NovelAI ↗</TrackedNovelAiHomeLink></footer>
    </main>
  );
}
