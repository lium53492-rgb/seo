import Image from "next/image";
import { TrackedPlayworldsLink } from "@/app/components/TrackedPlayworldsLink";
import { parseMarkdownBlocks } from "@/lib/seo/markdown-semantics.mjs";
import type { RelatedSeoPage } from "@/lib/seo/page-presentation";
import { publicAssetPath } from "@/lib/seo/site";
import type { PublishedSeoPage } from "@/lib/seo/types";
import styles from "./story-driven-adventure.module.css";

type StoryDrivenAdventurePageProps = {
  page: PublishedSeoPage;
  relatedPages: RelatedSeoPage[];
  mode?: "preview" | "public";
};

type LabeledItem = {
  label: string;
  body: string;
};

type ScenarioBrief = {
  id: string;
  code: string;
  title: string;
  role: string;
  situation: string;
  pressure: string;
  decision: string;
  firstLine: string;
  voiceCue: string;
  extras: LabeledItem[];
};

const scenarioFieldNames = new Set([
  "role",
  "situation",
  "pressure",
  "decision",
  "first line",
  "voice direction",
]);

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
      <li key={`${item.slice(0, 24)}-${itemIndex}`}><InlineMarkdown value={item} /></li>
    ));
    return block.ordered
      ? <ol key={`ordered-${blockIndex}`}>{items}</ol>
      : <ul key={`unordered-${blockIndex}`}>{items}</ul>;
  });
}

function parseLabeledItem(value: string): LabeledItem {
  const match = value.trim().match(/^\*\*([^*]+?):?\*\*\s*([\s\S]+)$/);
  if (!match) return { label: "", body: value.trim() };
  return { label: match[1].replace(/:$/, "").trim(), body: match[2].trim() };
}

function splitSection(value: string) {
  const blocks = parseMarkdownBlocks(value);
  const lead = blocks
    .filter((block) => block.type === "prose")
    .map((block) => block.text)
    .join("\n\n");
  const items = blocks
    .filter((block) => block.type === "list")
    .flatMap((block) => block.items)
    .map(parseLabeledItem);
  return { lead, items };
}

function parseScenarioBody(value: string) {
  const fields = new Map<string, string>();
  const unlabelled: string[] = [];
  const extras: LabeledItem[] = [];

  for (const block of parseMarkdownBlocks(value)) {
    if (block.type !== "prose") continue;
    const field = parseLabeledItem(block.text);
    const key = field.label.toLowerCase();
    if (field.label && scenarioFieldNames.has(key) && !fields.has(key)) fields.set(key, field.body);
    else if (field.label && scenarioFieldNames.has(key)) extras.push(field);
    else if (field.label) extras.push(field);
    else unlabelled.push(field.body);
  }

  return {
    role: fields.get("role") ?? "",
    situation: fields.get("situation") ?? unlabelled.join(" "),
    pressure: fields.get("pressure") ?? "",
    decision: fields.get("decision") ?? "",
    firstLine: fields.get("first line") ?? "",
    voiceCue: fields.get("voice direction") ?? "",
    extras,
  };
}

function wordmarkInitials(value: string) {
  const words = value
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) {
    const word = words[0];
    return word.toLowerCase().startsWith("playw")
      ? `${word[0]}${word[4]}`.toUpperCase()
      : word.slice(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function StoryDrivenAdventurePage({
  page,
  relatedPages,
  mode = "public",
}: StoryDrivenAdventurePageProps) {
  if (!page.architecture || !page.signatureModule) return null;

  const { architecture, signatureModule } = page;
  const copy = architecture.presentation.surfaceCopy;
  const isPreview = mode === "preview";
  const brand = copy.eyebrow.split("/")[0]?.trim() || page.title;
  const sectionPlan = new Map(
    architecture.content.sections.map((section) => [section.id, section]),
  );
  const findSection = (role: (typeof page.sections)[number]["role"]) =>
    page.sections.find((section) => section.role === role);
  const directAnswer = findSection("direct_answer");
  const failureAnalysis = findSection("failure_analysis");
  const roleFramework = findSection("framework");
  const firstMove = findSection("worked_example");
  const productBridge = findSection("next_step");
  if (!directAnswer || !failureAnalysis || !roleFramework || !firstMove || !productBridge) return null;
  const requiredSections = [directAnswer, failureAnalysis, roleFramework, firstMove, productBridge];
  if (new Set(requiredSections.map((section) => section.id)).size !== requiredSections.length) return null;
  const featuredSectionIds = new Set(
    [directAnswer, roleFramework, firstMove, productBridge].map((section) => section.id),
  );
  const additionalSections = [
    failureAnalysis,
    ...page.sections.filter((section) =>
      !featuredSectionIds.has(section.id) && section.id !== failureAnalysis.id),
  ];

  const framework = splitSection(roleFramework.bodyMarkdown);
  const practice = splitSection(firstMove.bodyMarkdown);
  const scenarios: ScenarioBrief[] = signatureModule.items.map((item, index) => ({
    id: `mission-${index + 1}`,
    code: item.label,
    title: item.title,
    ...parseScenarioBody(item.bodyMarkdown),
  }));
  const primarySignal = scenarios[0];

  return (
    <main
      className={styles.page}
      id="top"
      data-presentation-recipe={architecture.presentation.recipeId}
      data-renderer={architecture.presentation.rendererId}
      data-motif={architecture.presentation.motifId}
    >
      <a className={styles.skipLink} href="#missions">Skip to the mission archive</a>
      {isPreview ? (
        <div className={styles.previewBar}>
          <span>Protected concept / noindex</span>
          <strong>Preview only - release gates still apply</strong>
        </div>
      ) : null}

      <header className={styles.hero}>
        <div className={styles.starfield} aria-hidden="true" />
        <div className={styles.mist} aria-hidden="true" />
        <div className={styles.signalFold} aria-hidden="true" />

        <nav className={styles.nav} aria-label="Adventure page navigation">
          <a className={styles.wordmark} href="#top" aria-label={`${brand} home`}>
            <span>{wordmarkInitials(brand)}</span>
            <b>{brand}</b>
          </a>
          <a className={styles.navAction} href="#missions">
            {copy.contentsLabel} <span aria-hidden="true">-&gt;</span>
          </a>
        </nav>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>{copy.eyebrow}</p>
            <h1>{page.h1}</h1>
            <p className={styles.heroHook}>{copy.shortAnswerLabel}</p>
            <div className={styles.heroAnswer}><RichText value={page.heroMarkdown} /></div>
            <div className={styles.heroActions}>
              <a href="#missions">{signatureModule.title}</a>
              <span>{architecture.intent.oneSentenceAnswer}</span>
            </div>
          </div>

          <div className={styles.signalWindow} aria-label="Incoming science-fiction mission signal">
            <div className={styles.avatarShard}>
              <Image
                src={publicAssetPath("/images/story-driven-ai-voice-adventure.webp")}
                alt={primarySignal
                  ? `${primarySignal.role} inside ${primarySignal.title}.`
                  : `${brand} science-fiction mission signal.`}
                fill
                priority
                sizes="(max-width: 760px) 94vw, 58vw"
                className={styles.avatarImage}
              />
              <div className={styles.scanlines} aria-hidden="true" />
            </div>
            {primarySignal ? (
              <div className={styles.transmission}>
                <span>{primarySignal.code}</span>
                <strong>{primarySignal.role}</strong>
                <p><q>{primarySignal.firstLine || primarySignal.situation}</q></p>
              </div>
            ) : null}
            <ol className={styles.missionIndex} aria-label="Mission index">
              {scenarios.map((scenario, index) => (
                <li key={scenario.id}>
                  <a href={`#${scenario.id}`}>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    <span>{scenario.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </header>

      <section
        className={`${styles.passage} ${styles.directAnswer}`}
        data-passage="standalone"
        data-content-role={directAnswer.role}
        data-content-format={directAnswer.format}
        aria-labelledby={`${directAnswer.id}-heading`}
      >
        <div className={styles.passageLabel}>{copy.sectionLabel}</div>
        <div>
          <p className={styles.eyebrow}>{sectionPlan.get(directAnswer.id ?? "")?.readerQuestion}</p>
          <h2 id={`${directAnswer.id}-heading`}>{directAnswer.heading}</h2>
        </div>
        <div className={styles.answerCopy}><RichText value={directAnswer.bodyMarkdown} /></div>
      </section>

      <section
        className={styles.missions}
        id="missions"
        data-signature-module={signatureModule.id}
        data-signature-type={signatureModule.type}
        aria-labelledby="missions-heading"
      >
        <header className={styles.missionsHeader}>
          <div className={styles.passageLabel}>{copy.contentsLabel}</div>
          <p className={styles.eyebrow}>{architecture.content.signature.readerAction}</p>
          <h2 id="missions-heading">{signatureModule.title}</h2>
          <div className={styles.signatureIntro}><RichText value={signatureModule.intro} /></div>
        </header>

        <div className={styles.scenarioStack}>
          {scenarios.map((scenario, index) => (
            <article
              className={styles.scenario}
              id={scenario.id}
              key={scenario.id}
              data-passage="standalone"
            >
              <div className={styles.scenarioNumber} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className={styles.scenarioTopline}>
                <span>{scenario.code}</span>
                <b>{scenario.role}</b>
              </div>
              <h3>{scenario.title}</h3>
              <p className={styles.scenarioSituation}>{scenario.situation}</p>
              <dl className={styles.missionBrief}>
                {[
                  ["Pressure", scenario.pressure],
                  ["Decision", scenario.decision],
                  ["First line", scenario.firstLine],
                  ...scenario.extras.map((item) => [item.label, item.body]),
                ].filter((entry) => entry[1]).map(([label, value]) => (
                  <div className={label === "First line" ? styles.firstLine : undefined} key={label}>
                    <dt>{label}</dt>
                    <dd>{label === "First line" ? <q>{value}</q> : value}</dd>
                  </div>
                ))}
              </dl>
              {scenario.voiceCue ? (
                <details className={styles.voiceFold}>
                  <summary>Open the voice direction</summary>
                  <p>{scenario.voiceCue}</p>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section
        className={`${styles.passage} ${styles.signalLock}`}
        id={roleFramework.id}
        data-passage="standalone"
        data-content-role={roleFramework.role}
        data-content-format={roleFramework.format}
        aria-labelledby={`${roleFramework.id}-heading`}
      >
        <div className={styles.signalIntro}>
          <div className={styles.passageLabel}>{copy.sectionLabel}</div>
          <p className={styles.eyebrow}>{sectionPlan.get(roleFramework.id ?? "")?.readerQuestion}</p>
          <h2 id={`${roleFramework.id}-heading`}>{roleFramework.heading}</h2>
          <RichText value={framework.lead} />
        </div>

        <div className={styles.signalDiagram} role="group" aria-labelledby={`${roleFramework.id}-heading`}>
          {framework.items.map((item, index) => (
            <div
              className={`${styles.signalPoint} ${index === 0 ? styles.want : index === 1 ? styles.secret : styles.decision}`}
              key={`${item.label}-${index}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.label}</strong>
              <p>{item.body}</p>
            </div>
          ))}
          <div className={styles.signalCore} aria-hidden="true">
            <small>ROLE SIGNAL</small>
            <strong>LOCKED</strong>
          </div>
        </div>
      </section>

      <section
        className={`${styles.passage} ${styles.firstMove}`}
        id={firstMove.id}
        data-passage="standalone"
        data-content-role={firstMove.role}
        data-content-format={firstMove.format}
        aria-labelledby={`${firstMove.id}-heading`}
      >
        <div className={styles.firstMoveLead}>
          <div className={styles.passageLabel}>{copy.sectionLabel}</div>
          <p className={styles.eyebrow}>{sectionPlan.get(firstMove.id ?? "")?.readerQuestion}</p>
          <h2 id={`${firstMove.id}-heading`}>{firstMove.heading}</h2>
          <RichText value={practice.lead} />
        </div>
        <ol className={styles.firstMoveSteps}>
          {practice.items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{item.label}</b>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        className={`${styles.passage} ${styles.productBridge}`}
        id={productBridge.id}
        data-passage="standalone"
        data-content-role={productBridge.role}
        data-content-format={productBridge.format}
        aria-labelledby={`${productBridge.id}-heading`}
      >
        <div className={styles.bridgeOrbit} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.bridgeContent}>
          <div className={styles.passageLabel}>{copy.sectionLabel}</div>
          <p className={styles.eyebrow}>{sectionPlan.get(productBridge.id ?? "")?.readerQuestion}</p>
          <h2 id={`${productBridge.id}-heading`}>{productBridge.heading}</h2>
          <RichText value={productBridge.bodyMarkdown} />
          <p className={styles.eyebrow}>{copy.finalCtaEyebrow}</p>
          <h3 className={styles.ctaHeading}>{copy.finalCtaHeading}</h3>
          <p>{copy.finalCtaBody}</p>
          {isPreview ? (
            <button className={styles.previewCta} type="button" disabled>
              <small>Playworlds CTA / disabled in protected preview</small>
              <strong>{page.primaryCta}</strong>
            </button>
          ) : (
            <TrackedPlayworldsLink
              className={styles.liveCta}
              sourceSlug={page.slug}
              location="final_cta"
            >
              {page.primaryCta} <span aria-hidden="true">-&gt;</span>
            </TrackedPlayworldsLink>
          )}
        </div>
      </section>

      {additionalSections.map((section) => (
        <section
          className={`${styles.passage} ${styles.additionalSignal}`}
          id={section.id}
          key={section.id ?? section.heading}
          data-passage="standalone"
          data-content-role={section.role}
          data-content-format={section.format}
          aria-labelledby={`${section.id}-heading`}
        >
          <div>
            <div className={styles.passageLabel}>{copy.sectionLabel}</div>
            <p className={styles.eyebrow}>{sectionPlan.get(section.id ?? "")?.readerQuestion}</p>
            <h2 id={`${section.id}-heading`}>{section.heading}</h2>
          </div>
          <div className={styles.answerCopy}><RichText value={section.bodyMarkdown} /></div>
        </section>
      ))}

      <section
        className={`${styles.passage} ${styles.faq}`}
        data-passage="standalone"
        aria-labelledby="faq-heading"
      >
        <div className={styles.faqHeading}>
          <div className={styles.passageLabel}>{copy.faqEyebrow}</div>
          <p className={styles.eyebrow}>{architecture.content.thesis}</p>
          <h2 id="faq-heading">{copy.faqHeading}</h2>
        </div>
        <div className={styles.faqList}>
          {page.faqs.map((faq, index) => (
            <details key={faq.id ?? faq.question} open={index === 0} data-faq-job={faq.job}>
              <summary>{faq.question}</summary>
              <RichText value={faq.answerMarkdown} />
            </details>
          ))}
        </div>
      </section>

      {relatedPages.length ? (
        <aside className={`${styles.passage} ${styles.related}`} aria-labelledby="related-heading">
          <div>
            <div className={styles.passageLabel}>CONNECTED SIGNALS</div>
            <h2 id="related-heading">{copy.relatedHeading}</h2>
          </div>
          <div className={styles.relatedList}>
            {relatedPages.map((link) => (
              <a href={link.href} key={link.href}>
                <strong>{link.anchor}</strong>
                <span>{link.target.metaDescription}</span>
              </a>
            ))}
          </div>
        </aside>
      ) : null}

      <footer className={styles.footer}>
        <span>{page.title}</span>
        <p>{page.metaDescription}</p>
        <a href="#top">{copy.backToTop} -&gt;</a>
      </footer>
    </main>
  );
}
