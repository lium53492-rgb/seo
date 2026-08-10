import { TrackedNovelAiHomeLink } from "@/app/components/TrackedNovelAiHomeLink";
import { listMarkdownRenderBlocks, parseMarkdownBlocks } from "@/lib/seo/markdown-semantics.mjs";
import type { PresentationRecipe } from "@/lib/seo/page-presentation";
import type { SeoPageViewProps } from "./page-family-types";
import styles from "./structured-content.module.css";

type StructuredContentPageProps = SeoPageViewProps & {
  recipe: PresentationRecipe;
};

function InlineMarkdown({ value }: { value: string }) {
  return value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
      : <span key={`${part}-${index}`}>{part}</span>
  );
}

function RichText({ value }: { value: string }) {
  return value.split(/\n{2,}/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => (
    <p key={`${paragraph.slice(0, 24)}-${index}`}><InlineMarkdown value={paragraph.trim()} /></p>
  ));
}

function SemanticMarkdown({ value, listOrder }: { value: string; listOrder?: boolean }) {
  const blocks = listOrder === undefined
    ? parseMarkdownBlocks(value)
    : listMarkdownRenderBlocks(value, listOrder);
  return blocks.map((block, blockIndex) => {
    if (block.type === "prose") {
      return <p key={`prose-${block.text.slice(0, 24)}-${blockIndex}`}><InlineMarkdown value={block.text} /></p>;
    }
    const items = block.items.map((item, itemIndex) => (
      <li key={`${item.slice(0, 24)}-${itemIndex}`}><InlineMarkdown value={item} /></li>
    ));
    return block.ordered
      ? <ol key={`ordered-${blockIndex}`}>{items}</ol>
      : <ul key={`unordered-${blockIndex}`}>{items}</ul>;
  });
}

export function StructuredContentPage({ page, recipe, relatedPages }: StructuredContentPageProps) {
  if (!page.architecture || !page.signatureModule) return null;
  const { architecture, signatureModule } = page;
  const copy = architecture.presentation.surfaceCopy;
  const sectionMarker = (index: number) =>
    (recipe.domainConcepts[index % recipe.domainConcepts.length] || recipe.sectionMarkerStyle).toUpperCase();

  const signatureItems = (() => {
    if (["comparison", "diagnostic", "myth_fact"].includes(signatureModule.type)) {
      return (
        <dl className={styles.signatureDefinition}>
          {signatureModule.items.map((item) => (
            <div key={`${item.label}-${item.title}`}>
              <dt><span>{item.label}</span>{item.title}</dt>
              <dd><RichText value={item.bodyMarkdown} /></dd>
            </div>
          ))}
        </dl>
      );
    }
    if (signatureModule.type === "inventory" || signatureModule.type === "checklist") {
      return (
        <ul className={styles.signatureList}>
          {signatureModule.items.map((item) => (
            <li key={`${item.label}-${item.title}`}>
              <span>{item.label}</span><h3>{item.title}</h3><RichText value={item.bodyMarkdown} />
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ol className={styles.signatureList}>
        {signatureModule.items.map((item) => (
          <li key={`${item.label}-${item.title}`}>
            <span>{item.label}</span><h3>{item.title}</h3><RichText value={item.bodyMarkdown} />
          </li>
        ))}
      </ol>
    );
  })();

  const signature = (
    <aside
      className={styles.signature}
      data-signature-module={signatureModule.id}
      data-signature-type={signatureModule.type}
      aria-labelledby="signature-module-heading"
    >
      <div className={styles.signatureIntro}>
        <span>{architecture.content.signature.readerAction}</span>
        <h2 id="signature-module-heading">{signatureModule.title}</h2>
        <RichText value={signatureModule.intro} />
      </div>
      {signatureItems}
    </aside>
  );

  const hero = (className: string, answerFirst = false) => (
    <header className={`${styles.hero} ${className} ${answerFirst ? styles.answerFirstHero : ""}`}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1>{page.h1}</h1>
        <RichText value={page.heroMarkdown} />
        <TrackedNovelAiHomeLink className={styles.heroCta} sourceSlug={page.slug} location="hero">
          {page.primaryCta}
        </TrackedNovelAiHomeLink>
      </div>
      <aside className={styles.shortAnswer} aria-label={copy.shortAnswerLabel}>
        <span>{copy.shortAnswerLabel}</span>
        <p>{architecture.intent.oneSentenceAnswer}</p>
        <small>{architecture.content.thesis}</small>
      </aside>
    </header>
  );

  const contents = (
    <nav className={styles.contents} aria-label="On this page">
      <span>{copy.contentsLabel}</span>
      <ol>
        {page.sections.map((section, index) => (
          <li key={section.id ?? section.heading}>
            <a href={`#${section.id}`}><b>{sectionMarker(index)}</b>{section.heading}</a>
          </li>
        ))}
      </ol>
    </nav>
  );

  const layerBody = (section: (typeof page.sections)[number]) => {
    const text = <RichText value={section.bodyMarkdown} />;
    switch (section.format) {
      case "comparison": return <div className={styles.comparisonBody}><SemanticMarkdown value={section.bodyMarkdown} /></div>;
      case "checklist": return <div className={styles.checklistBody}><SemanticMarkdown value={section.bodyMarkdown} listOrder={false} /></div>;
      case "callout": return <aside className={styles.calloutBody}>{text}</aside>;
      case "examples": return <section className={styles.exampleBody} aria-label={`${section.heading} examples`}><SemanticMarkdown value={section.bodyMarkdown} listOrder={false} /></section>;
      case "steps": return <div className={styles.stepsBody}><SemanticMarkdown value={section.bodyMarkdown} listOrder={true} /></div>;
      default: return <div className={styles.proseBody}>{text}</div>;
    }
  };

  const layers = (className: string) => (
    <section className={`${styles.layers} ${className}`} aria-label="Article">
      {page.sections.map((section, index) => (
        <div key={section.id ?? section.heading} className={styles.layerUnit}>
          <article
            className={styles.layer}
            id={section.id}
            data-content-role={section.role}
            data-content-format={section.format}
          >
            <div className={styles.layerLabel}>
              <span>{copy.sectionLabel}</span>
              <b>{sectionMarker(index)}</b>
            </div>
            <div className={styles.layerCopy}>
              <p className={styles.layerPurpose}>{architecture.content.sections[index]?.readerQuestion}</p>
              <h2>{section.heading}</h2>
              {layerBody(section)}
            </div>
          </article>
          {architecture.content.signature.afterSectionId === section.id ? signature : null}
        </div>
      ))}
    </section>
  );

  const faq = (
    <section className={styles.faq} aria-labelledby="structured-faq-heading">
      <div>
        <span>{copy.faqEyebrow}</span>
        <h2 id="structured-faq-heading">{copy.faqHeading}</h2>
      </div>
      <div className={styles.faqList}>
        {page.faqs.map((item) => (
          <details key={item.id ?? item.question} data-faq-job={item.job}>
            <summary>{item.question}</summary>
            <RichText value={item.answerMarkdown} />
          </details>
        ))}
      </div>
    </section>
  );

  const related = relatedPages.length ? (
    <aside className={styles.related} aria-labelledby="structured-related-heading">
      <h2 id="structured-related-heading">{copy.relatedHeading}</h2>
      {relatedPages.map((link) => (
        <a key={link.href} href={link.href}>
          <strong>{link.anchor}</strong>
          <span>{link.target.metaDescription}</span>
        </a>
      ))}
    </aside>
  ) : null;

  const finalCta = (
    <footer className={styles.finalCta}>
      <span>{copy.finalCtaEyebrow}</span>
      <h2>{copy.finalCtaHeading}</h2>
      <p>{copy.finalCtaBody}</p>
      <TrackedNovelAiHomeLink sourceSlug={page.slug} location="final_cta">
        {page.primaryCta}
      </TrackedNovelAiHomeLink>
      <a href="#top">{copy.backToTop}</a>
    </footer>
  );

  const renderer = (() => {
    switch (architecture.presentation.rendererId) {
      case "rehearsal_slate":
        return <>{hero(styles.slateHero)}{contents}{layers(styles.slateLayers)}{faq}{related}{finalCta}</>;
      case "nocturne_decision_grid":
        return <>{hero(styles.decisionHero, true)}<div className={styles.decisionBoard}><aside>{contents}</aside>{layers(styles.decisionLayers)}</div>{faq}{related}{finalCta}</>;
      case "product_field_manual":
        return <>{hero(styles.manualCover)}<div className={styles.manualSpread}><aside>{contents}</aside><article>{layers(styles.manualLayers)}</article></div>{faq}{related}{finalCta}</>;
      case "editorial_argument":
        return <>{hero(styles.editorialHero)}<article className={styles.editorialFlow}>{contents}{layers(styles.editorialLayers)}</article>{faq}{related}{finalCta}</>;
      case "specimen_catalog":
        return <>{hero(styles.catalogHero)}<section className={styles.catalogFrame}>{contents}{layers(styles.catalogLayers)}</section>{faq}{related}{finalCta}</>;
      case "orbital_mission_log":
        return <>{hero(styles.missionHero, true)}<div className={styles.missionConsole}>{contents}{layers(styles.missionLayers)}</div>{faq}{related}{finalCta}</>;
      case "playful_story_workshop":
        return <>{hero(styles.workshopHero)}<section className={styles.workshopTable}>{layers(styles.workshopLayers)}{contents}</section>{faq}{related}{finalCta}</>;
    }
  })();

  return (
    <main
      className={styles.shell}
      id="top"
      data-presentation-recipe={recipe.id}
      data-renderer={recipe.rendererId}
      data-companion-policy={architecture.presentation.companion}
      data-gallery-policy={architecture.presentation.gallery}
      data-motif={recipe.motifId}
      data-section-marker-style={recipe.sectionMarkerStyle}
      data-section-flow={recipe.sectionFlow}
    >
      <nav className={styles.nav} aria-label="Primary navigation">
        <a href="/">Tabletop Field Notes</a>
        <span>{copy.eyebrow}</span>
      </nav>
      {renderer}
    </main>
  );
}
