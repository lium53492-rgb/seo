import type { Metadata } from "next";
import { FAQJsonLd } from "next-seo";
import { TrackedNovelAiHomeLink } from "./components/TrackedNovelAiHomeLink";
import { listPublishedPages } from "@/lib/seo/page-store";

const pageTitle = "Story-Led AI Voice Roleplay";
const pageDescription =
  "Explore a story-led AI voice roleplay format that begins with an existing plot and lets you choose an available story character.";

export const metadata: Metadata = {
  title: `${pageTitle} | Interactive AI Story`,
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
      "Open the story, review the characters available in that plot, and select the one you want to perform as. Your role gives you a point of view inside the scene.",
  },
];

export default async function Home() {
  const publishedPages = await listPublishedPages();
  return (
    <main>
      <FAQJsonLd questions={faqs} />

      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Story-led roleplay</p>
          <h1>Story-Led AI Voice Roleplay</h1>
          <p className="lede">
            Begin with an existing plot, choose an available character, and
            perform from inside the scene instead of starting with an empty chat box.
          </p>
          <div className="actions">
            <TrackedNovelAiHomeLink className="primaryAction" location="homepage" sourceSlug="homepage">
              Explore stories on NovelAI
            </TrackedNovelAiHomeLink>
            <a className="secondaryAction" href="#story-preview">
              See how it works
            </a>
          </div>
        </div>

        <div className="poster" aria-label="Abstract illustration of a story and role selection">
          <div className="posterWindow">
            <span />
            <span />
            <span />
          </div>
          <div className="posterRoom">
            <div className="calendar">STORY</div>
            <div className="tv" />
            <div className="table">
              <div className="teacup" />
              <div className="book" />
            </div>
            <div className="couple">
              <div className="person leftPerson" />
              <div className="person rightPerson" />
            </div>
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
              setting, situation, and reason to enter the scene. The first step is
              understanding what is already happening, not inventing a world from
              nothing.
            </p>
          </article>
          <article>
            <h3>Choose an available character</h3>
            <p>
              You choose from the characters available in the featured story.
              That choice gives you a point of view and helps you find a natural
              place to begin inside the opening situation.
            </p>
          </article>
          <article>
            <h3>Perform from inside the scene</h3>
            <p>
              The format is built around acting inside a story. With a plot and
              role already in view, you can focus on the character&apos;s immediate
              circumstances and the scene in front of them.
            </p>
          </article>
        </div>
      </section>

      <section className="splitBand">
        <div>
          <p className="eyebrow">What this page helps explain</p>
          <h2>A story-first format gives roleplay a concrete starting point.</h2>
          <p>
            This guide explains the story, role, and scene structure behind an
            AI voice roleplay experience. The page stays with approved facts
            rather than borrowed characters or fictional worlds, and it keeps the
            path into the product honest.
          </p>
        </div>
        <ul className="featureList">
          <li>An existing story premise</li>
          <li>Available story characters</li>
          <li>A role-led point of view</li>
          <li>A scene to perform inside</li>
          <li>A guide without third-party IP</li>
        </ul>
      </section>

      <section className="faqBand">
        <p className="eyebrow">FAQ</p>
        <h2>Before you start</h2>
        <div className="faqList">
          {faqs.map((faq) => (
            <article key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      {publishedPages.length ? (
        <section className="publishedBand">
          <p className="eyebrow">Voice Roleplay Guides</p>
          <h2>Explore more ways to enter an AI story.</h2>
          <div className="publishedLinks">
            {publishedPages.slice(0, 6).map((page) => (
              <a href={page.path} key={page.slug}>
                <small>{page.keyword}</small>
                <strong>{page.h1}</strong>
                <span>Read the guide →</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="finalCta">
        <h2>Explore a story-led roleplay experience</h2>
        <p>
          Open NovelAI in a new tab to explore its current story experience.
        </p>
        <TrackedNovelAiHomeLink className="primaryAction" location="homepage" sourceSlug="homepage">
          Explore on NovelAI
        </TrackedNovelAiHomeLink>
      </section>
    </main>
  );
}
