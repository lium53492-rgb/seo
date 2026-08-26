import Image from "next/image";
import { TrackedPlayworldsLink } from "@/app/components/TrackedPlayworldsLink";
import { parseMarkdownBlocks } from "@/lib/seo/markdown-semantics.mjs";
import type { RelatedSeoPage } from "@/lib/seo/page-presentation";
import type { PublishedSeoPage } from "@/lib/seo/types";
import styles from "./campaign-state-comparison.module.css";

type CampaignStateComparisonPageProps = {
  page: PublishedSeoPage;
  relatedPages: RelatedSeoPage[];
  mode?: "preview" | "public";
};

type LoopLane = {
  label: string;
  body: string;
};

function InlineMarkdown({ value }: { value: string }) {
  return value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
      : <span key={`${part}-${index}`}>{part}</span>
  );
}

function RichText({ value }: { value: string }) {
  return parseMarkdownBlocks(value).map((block, blockIndex) => {
    if (block.type === "prose") {
      return (
        <p key={`prose-${block.text.slice(0, 24)}-${blockIndex}`}>
          <InlineMarkdown value={block.text} />
        </p>
      );
    }

    const items = block.items.map((item, itemIndex) => (
      <li key={`${item.slice(0, 24)}-${itemIndex}`}>
        <InlineMarkdown value={item} />
      </li>
    ));
    return block.ordered
      ? <ol key={`ordered-${blockIndex}`}>{items}</ol>
      : <ul key={`unordered-${blockIndex}`}>{items}</ul>;
  });
}

function parseLoopLanes(value: string): LoopLane[] {
  return parseMarkdownBlocks(value)
    .filter((block) => block.type === "prose")
    .map((block) => {
      const match = block.text.match(/^\*\*([^*]+?):\*\*\s+([\s\S]+)$/);
      return match
        ? { label: match[1].trim(), body: match[2].trim() }
        : { label: "", body: block.text.trim() };
    });
}

function sectionMarker(role: PublishedSeoPage["sections"][number]["role"]) {
  return String(role || "section").replaceAll("_", " ");
}

function loopMarker(index: number) {
  return index < 3 ? String(index + 1).padStart(2, "0") : "↺";
}

function loopLabel(label: string, index: number) {
  return index < 3 ? label : label.replace(/^\d+\s*\/\s*/, "↺ / ");
}

function LoopLabel({ label, index }: { label: string; index: number }) {
  const visibleLabel = loopLabel(label, index);
  if (visibleLabel === label) return <span>{label}</span>;
  return (
    <>
      <span aria-hidden="true">{visibleLabel}</span>
      <span className={styles.screenReaderOnly}>{label}</span>
    </>
  );
}

function routeMarker(index: number) {
  if (index < 3) return String(index + 1).padStart(2, "0");
  return index === 3 ? "EX" : "GO";
}

export function CampaignStateComparisonPage({
  page,
  relatedPages,
  mode = "public",
}: CampaignStateComparisonPageProps) {
  if (!page.architecture || !page.signatureModule) return null;

  const { architecture, signatureModule } = page;
  const copy = architecture.presentation.surfaceCopy;
  const isPreview = mode === "preview";
  const sectionPlan = new Map(
    architecture.content.sections.map((section) => [section.id, section]),
  );

  return (
    <div
      className={styles.page}
      data-presentation-recipe={architecture.presentation.recipeId}
      data-renderer={architecture.presentation.rendererId}
      data-motif={architecture.presentation.motifId}
      data-section-flow="branching-turn-trace"
    >
      <a className={styles.skipLink} href="#practical-difference">Skip to the comparison</a>

      {isPreview ? (
        <div className={styles.previewBar}>
          <span>Protected concept / noindex</span>
          <strong>Preview only — release gates still apply</strong>
        </div>
      ) : null}

      <header className={styles.hero}>
        <div className={styles.heroImage}>
          <Image
            className={styles.heroImageMedia}
            src="/story-scenes/campaign-keeper-v1.webp"
            alt="An original dark-fantasy campaign keeper framed by fog and an ember-lit ritual circle."
            fill
            sizes="100vw"
            priority
          />
        </div>
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.mapGrid} aria-hidden="true" />
        <div className={styles.fog} aria-hidden="true" />

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>{copy.eyebrow}</p>
            <h1>{page.h1}</h1>
            <p className={styles.heroQuestion}>{copy.shortAnswerLabel}</p>
            <div className={styles.heroAnswer}><RichText value={page.heroMarkdown} /></div>
            {isPreview ? (
              <span className={styles.disabledCta} aria-disabled="true">{page.primaryCta}</span>
            ) : (
              <TrackedPlayworldsLink
                className={styles.heroCta}
                sourceSlug={page.slug}
                location="hero"
              >
                {page.primaryCta} <span aria-hidden="true">↗</span>
              </TrackedPlayworldsLink>
            )}
          </div>
        </div>
      </header>

      <section className={styles.instrumentBand} aria-label="Campaign loop test summary">
        <aside className={styles.turnInstrument} aria-label={signatureModule.title}>
            <div className={styles.instrumentHead}>
              <span>{architecture.content.signature.readerAction}</span>
              <strong>{signatureModule.title}</strong>
            </div>
            <ol className={styles.loopPreview}>
              {signatureModule.items.map((item, index) => (
                <li key={`${item.label}-${item.title}`}>
                  <LoopLabel label={item.label} index={index} />
                  <p>{item.title}</p>
                  <i aria-hidden="true">{loopMarker(index)}</i>
                </li>
              ))}
            </ol>
            <p className={styles.instrumentThesis}>{architecture.content.thesis}</p>
        </aside>
      </section>

      <nav className={styles.contents} aria-label="On this page">
        <span>{copy.contentsLabel}</span>
        <ol>
          {page.sections.map((section, index) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>
                <b>{routeMarker(index)}</b>
                <span>{section.heading}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className={styles.article} aria-label="AI game master and chatbot comparison">
        {page.sections.map((section, index) => (
          <div className={styles.sectionUnit} key={section.id}>
            <section
              className={styles.passage}
              id={section.id}
              data-passage="standalone"
              data-content-role={section.role}
              data-content-format={section.format}
              aria-labelledby={`${section.id}-heading`}
            >
              <div className={styles.passageRail}>
                <span>{routeMarker(index)}</span>
                <b>{copy.sectionLabel} / {sectionMarker(section.role)}</b>
              </div>
              <div className={styles.passageHeading}>
                <p>{sectionPlan.get(section.id ?? section.heading)?.readerQuestion}</p>
                <h2 id={`${section.id}-heading`}>{section.heading}</h2>
              </div>
              <div className={styles.passageBody}><RichText value={section.bodyMarkdown} /></div>
            </section>

            {architecture.content.signature.afterSectionId === section.id ? (
              <section
                className={styles.trace}
                id="campaign-loop-console"
                data-signature-module={signatureModule.id}
                data-signature-type={signatureModule.type}
                aria-labelledby="campaign-loop-console-heading"
              >
                <header className={styles.traceHeader}>
                  <span>{architecture.content.signature.readerAction}</span>
                  <h2 id="campaign-loop-console-heading">{signatureModule.title}</h2>
                  <div><RichText value={signatureModule.intro} /></div>
                </header>

                <div className={styles.traceLegend} aria-hidden="true">
                  <span>Conversation lane</span>
                  <i />
                  <span>Campaign lane</span>
                </div>

                <ol className={styles.traceStages}>
                  {signatureModule.items.map((item, itemIndex) => {
                    const lanes = parseLoopLanes(item.bodyMarkdown);
                    return (
                      <li className={styles.traceStage} key={`${item.label}-${item.title}`}>
                        <div className={styles.traceIndex}>
                          <LoopLabel label={item.label} index={itemIndex} />
                          <b>{loopMarker(itemIndex)}</b>
                        </div>
                        <h3>{item.title}</h3>
                        <div className={styles.laneComparison}>
                          {lanes.map((lane, laneIndex) => (
                            <section
                              className={laneIndex === 0 ? styles.chatLane : styles.campaignLane}
                              key={`${lane.label}-${laneIndex}`}
                              aria-label={lane.label}
                            >
                              <span>{lane.label}</span>
                              <p>{lane.body}</p>
                            </section>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}
          </div>
        ))}
      </article>

      <section className={styles.faq} aria-labelledby="campaign-comparison-faq-heading">
        <div className={styles.faqHeading}>
          <span>{copy.faqEyebrow}</span>
          <h2 id="campaign-comparison-faq-heading">{copy.faqHeading}</h2>
          <p>{architecture.intent.oneSentenceAnswer}</p>
        </div>
        <div className={styles.faqList}>
          {page.faqs.map((faq, index) => (
            <details key={faq.id} open={index === 0} data-faq-job={faq.job}>
              <summary>{faq.question}</summary>
              <RichText value={faq.answerMarkdown} />
            </details>
          ))}
        </div>
      </section>

      {relatedPages.length ? (
        <aside className={styles.related} aria-labelledby="campaign-related-heading">
          <span>{copy.relatedHeading}</span>
          <div className={styles.relatedList}>
            {relatedPages.map((link) => (
              <a href={link.href} key={link.href}>
                <strong>{link.anchor}</strong>
                <p>{link.target.metaDescription}</p>
              </a>
            ))}
          </div>
        </aside>
      ) : null}

      <footer className={styles.finalCta}>
        <span>{copy.finalCtaEyebrow}</span>
        <h2>{copy.finalCtaHeading}</h2>
        <p>{copy.finalCtaBody}</p>
        {isPreview ? (
          <div className={styles.disabledCta} aria-disabled="true">{page.primaryCta}</div>
        ) : (
          <TrackedPlayworldsLink
            className={styles.finalLink}
            sourceSlug={page.slug}
            location="final_cta"
          >
            {page.primaryCta} <span aria-hidden="true">↗</span>
          </TrackedPlayworldsLink>
        )}
        <a className={styles.backToTop} href="#top">{copy.backToTop} ↑</a>
      </footer>
    </div>
  );
}
