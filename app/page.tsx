import type { Metadata } from "next";
import { FAQJsonLd } from "next-seo";
import { listPublishedPages } from "@/lib/seo/page-store";

const pageTitle = "Story-Led AI Voice Roleplay";
const pageDescription =
  "Explore first-party guides to story-led AI voice roleplay, existing plots, and choosing an available story character.";

export const metadata: Metadata = {
  title: `${pageTitle} | Interactive AI Story Guides`,
  description: pageDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: "/",
    type: "website",
  },
};

const faqs = [
  {
    question: "What is story-led AI voice roleplay?",
    answer:
      "It is an AI voice cosplay and roleplay format built around acting inside a story. You begin from an existing plot rather than an empty chat box.",
  },
  {
    question: "Do I need to create the story first?",
    answer:
      "No. Each playable experience starts from an existing story plot, so the opening situation is already in place before you choose a role.",
  },
  {
    question: "How do I choose a role?",
    answer:
      "Review the characters available in the story and select the one you want to perform as. Your role gives you a point of view inside the scene.",
  },
];

export default async function Home() {
  const publishedPages = await listPublishedPages();

  return (
    <main>
      <FAQJsonLd questions={faqs} scriptId="homepage-faq-jsonld" />

      <section className="hero">
        <nav className="homeNav" aria-label="Primary navigation">
          <a className="wordmark" href="/" aria-label="Interactive AI Story Guides home">
            <span className="wordmarkMark" aria-hidden="true">S</span>
            <span>STORY / VOICE</span>
          </a>
          <a className="navGuide" href="#guide-library">
            Browse guides <span aria-hidden="true">↘</span>
          </a>
        </nav>

        <div className="heroCopy">
          <p className="eyebrow">Interactive story guides</p>
          <h1>Enter a story.<br /><em>Choose your role.</em></h1>
          <p className="lede">
            Learn how a story-led roleplay begins with an existing plot, presents
            available characters, and gives you a clear point of view inside the scene.
          </p>
          <div className="actions">
            <a className="primaryAction" href="#guide-library">
              Browse story guides
            </a>
            <a className="secondaryAction" href="#story-preview">
              See how it works
            </a>
          </div>
        </div>

        <div className="poster" aria-label="An abstract story scene and character choice interface">
          <div className="posterChrome">
            <span className="posterStatus"><i /> Scene loaded</span>
            <span>01 / 03</span>
          </div>
          <div className="sceneGlow" />
          <div className="sceneFrame">
            <p>THE OPENING SCENE</p>
            <strong>The room is waiting.<br />Who will you be?</strong>
          </div>
          <div className="characterRail" aria-hidden="true">
            <div className="characterChoice active"><b>01</b><span>YOUR ROLE</span></div>
            <div className="characterChoice"><b>02</b><span>THE SETTING</span></div>
            <div className="characterChoice"><b>03</b><span>THE SCENE</span></div>
          </div>
        </div>
      </section>

      <section className="contentBand" id="story-preview">
        <div className="sectionIntro">
          <p className="eyebrow">A clear way in</p>
          <h2>Start with a story and a role, not a blank prompt.</h2>
        </div>
        <div className="copyGrid">
          <article>
            <h3>Begin from an existing plot</h3>
            <p>
              Each playable experience begins with a story plot that supplies a
              setting, situation, and reason to enter the scene.
            </p>
          </article>
          <article>
            <h3>Choose an available character</h3>
            <p>
              You choose from the characters available in the featured story.
              That choice gives you a point of view inside the opening situation.
            </p>
          </article>
          <article>
            <h3>Perform from inside the scene</h3>
            <p>
              With a plot and role already in view, you can focus on the
              character&apos;s immediate circumstances and the scene in front of them.
            </p>
          </article>
        </div>
      </section>

      <section className="splitBand">
        <div>
          <p className="eyebrow">What these guides explain</p>
          <h2>A story-first format gives roleplay a concrete starting point.</h2>
          <p>
            Read focused explanations of the plot, role, and scene structure behind
            story-led AI voice roleplay. Every guide stays with approved product facts
            and original material rather than borrowed characters or fictional worlds.
          </p>
        </div>
        <ul className="featureList">
          <li>An existing story premise</li>
          <li>Available story characters</li>
          <li>A role-led point of view</li>
          <li>A scene to perform inside</li>
          <li>Original, first-party guidance</li>
        </ul>
      </section>

      {publishedPages.length ? (
        <section className="publishedBand" id="guide-library">
          <p className="eyebrow">Story-led roleplay library</p>
          <h2>Choose the guide that matches what you want to understand.</h2>
          <div className="publishedLinks">
            {publishedPages.map((page) => (
              <a href={page.path} key={page.slug}>
                <small>{page.keyword}</small>
                <strong>{page.h1}</strong>
                <span>Read the guide →</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="faqBand">
        <p className="eyebrow">FAQ</p>
        <h2>Before you choose a guide</h2>
        <div className="faqList">
          {faqs.map((faq) => (
            <article key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="finalCta">
        <h2>Keep exploring on this site</h2>
        <p>
          Return to the guide library and choose a focused explanation of story-led roleplay.
        </p>
        <a className="primaryAction" href="#guide-library">
          View all story guides
        </a>
      </section>
    </main>
  );
}
