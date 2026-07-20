import type { Metadata } from "next";
import { FAQJsonLd } from "next-seo";
import { TrackedStoryLink } from "./components/TrackedStoryLink";
import { listPublishedPages } from "@/lib/seo/page-store";

const pageTitle = "2000s Marriage Life Simulator";
const pageDescription =
  "Play a nostalgic interactive AI story about newlywed life in the 2000s. Make daily choices, roleplay tender moments, and shape a slice-of-life marriage story.";

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
    type: "article",
  },
};

const faqs = [
  {
    question: "What is the 2000s Marriage Life Simulator?",
    answer:
      "It is an interactive AI story about newlywed daily life, family routines, small choices, and relationship moments in a nostalgic 2000s setting.",
  },
  {
    question: "Is this a game or a story?",
    answer:
      "It plays like both. You read the scene, choose how to respond, and continue the roleplay as the story changes around your decisions.",
  },
  {
    question: "Who is this story for?",
    answer:
      "It is best for players who enjoy slice-of-life roleplay, domestic drama, gentle relationship stories, and interactive fiction with everyday details.",
  },
];

export default async function Home() {
  const publishedPages = await listPublishedPages();
  return (
    <main>
      <FAQJsonLd questions={faqs} />

      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Interactive AI Story</p>
          <h1>2000s Marriage Life Simulator</h1>
          <p className="lede">
            Step into a warm newlywed life story set in the early 2000s. Make
            small daily choices, talk through tender moments, and see how a
            quiet marriage story unfolds around you.
          </p>
          <div className="actions">
            <TrackedStoryLink className="primaryAction" location="hero">
              Play This Story
            </TrackedStoryLink>
            <a className="secondaryAction" href="#story-preview">
              Read Preview
            </a>
          </div>
        </div>

        <div className="poster" aria-label="Illustrated preview of a 2000s newlywed apartment story">
          <div className="posterWindow">
            <span />
            <span />
            <span />
          </div>
          <div className="posterRoom">
            <div className="calendar">2000s</div>
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
          <p className="eyebrow">Story Premise</p>
          <h2>A nostalgic slice-of-life roleplay about marriage, home, and choice.</h2>
        </div>
        <div className="copyGrid">
          <article>
            <h3>Live Through Everyday Scenes</h3>
            <p>
              The story focuses on ordinary moments that feel personal: a shared
              meal, a difficult conversation, a household decision, or a quiet
              evening after a long day. Each scene gives you space to respond in
              your own way.
            </p>
          </article>
          <article>
            <h3>Shape the Relationship</h3>
            <p>
              Your choices can make the newlywed life feel tender, tense,
              playful, practical, or reflective. It is not about winning a level;
              it is about guiding the tone of a relationship.
            </p>
          </article>
          <article>
            <h3>Play a 2000s Domestic World</h3>
            <p>
              The setting leans into early-2000s home life: slower communication,
              neighborhood routines, family expectations, and small details that
              make the story feel grounded.
            </p>
          </article>
        </div>
      </section>

      <section className="splitBand">
        <div>
          <p className="eyebrow">Why Play It</p>
          <h2>For players who like gentle drama more than combat.</h2>
          <p>
            This AI story is a good fit if you search for interactive marriage
            story games, newlywed roleplay, Chinese family life simulators, or
            slice-of-life AI fiction. It gives you a specific scene to enter
            instead of a blank chatbot box.
          </p>
        </div>
        <ul className="featureList">
          <li>Newlywed relationship roleplay</li>
          <li>Guided story progression</li>
          <li>Domestic life decisions</li>
          <li>Warm 2000s nostalgia</li>
          <li>Choice-driven AI scenes</li>
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
        <h2>Start the 2000s Marriage Life Simulator</h2>
        <p>
          Open the story on NovelAI and begin with guided choices that move the
          relationship forward.
        </p>
        <TrackedStoryLink className="primaryAction" location="final_cta">
          Play on NovelAI
        </TrackedStoryLink>
      </section>
    </main>
  );
}
