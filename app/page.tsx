import type { Metadata } from "next";
import { FAQJsonLd } from "next-seo";
import { listPublishedPages } from "@/lib/seo/page-store";

const pageTitle = "D&D Field Guides for Players and Game Masters";
const pageDescription =
  "Original, adult-oriented field guides for D&D campaign prep, character craft, at-table improvisation, and campaign continuity.";

export const metadata: Metadata = {
  title: { absolute: `${pageTitle} | Tabletop Field Notes` },
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
    question: "Who are these D&D field guides for?",
    answer:
      "They are written for adult D&D players and Game Masters who want practical help with campaign preparation, character decisions, improvisation pressure, and continuity at the table.",
  },
  {
    question: "Is this an official D&D website?",
    answer:
      "No. This is independent, unofficial content. D&D identifies the tabletop audience; it does not imply affiliation with or endorsement by Wizards of the Coast.",
  },
  {
    question: "What material will the guides use?",
    answer:
      "The automated editorial baseline is original tabletop fantasy. SRD-derived material remains blocked until the workflow can record its exact version, license basis, and required attribution on every artifact.",
  },
];

export default async function Home() {
  const publishedPages = await listPublishedPages();
  const archiveAvailable = publishedPages.length > 0;
  const primaryHref = archiveAvailable ? "#guide-library" : "#campaign-pressure";

  return (
    <main>
      <FAQJsonLd questions={faqs} scriptId="homepage-faq-jsonld" />

      <section className="hero">
        <nav className="homeNav" aria-label="Primary navigation">
          <a className="wordmark" href="/" aria-label="Tabletop Field Notes home">
            <span className="wordmarkMark" aria-hidden="true">20</span>
            <span>TABLETOP / FIELD NOTES</span>
          </a>
          <a className="navGuide" href={primaryHref}>
            {archiveAvailable ? "Open the archive" : "Read the field notes"} <span aria-hidden="true">-&gt;</span>
          </a>
        </nav>

        <div className="heroCopy">
          <p className="eyebrow">For D&amp;D players and Game Masters</p>
          <h1>Make the next session<br /><em>hit harder.</em></h1>
          <p className="lede">
            Adult, table-ready field guides for campaign prep, character pressure,
            improvised turns, and the continuity problems that surface after session three.
          </p>
          <div className="actions">
            <a className="primaryAction" href={primaryHref}>
              {archiveAvailable ? "Read the field guides" : "See the editorial lanes"}
            </a>
            <a className="secondaryAction" href="#campaign-pressure">
              See the editorial lanes
            </a>
          </div>
        </div>

        <div className="poster" aria-label="A dark campaign pressure board for a Game Master">
          <div className="posterChrome">
            <span className="posterStatus"><i /> Session pressure: active</span>
            <span>Night 07 / Act II</span>
          </div>
          <div className="sceneGlow" />
          <div className="sceneFrame">
            <p>THE TABLE GOES QUIET</p>
            <strong>The plan just broke.<br />What changes now?</strong>
          </div>
          <div className="characterRail" aria-hidden="true">
            <div className="characterChoice active"><b>01</b><span>PRESSURE</span></div>
            <div className="characterChoice"><b>02</b><span>PLAYER AGENCY</span></div>
            <div className="characterChoice"><b>03</b><span>CONSEQUENCE</span></div>
          </div>
        </div>
      </section>

      <section className="contentBand" id="campaign-pressure">
        <div className="sectionIntro">
          <p className="eyebrow">Three pressures, one table</p>
          <h2>Useful content starts where a session can actually fail.</h2>
        </div>
        <div className="copyGrid">
          <article>
            <h3>The GM cannot prep everything</h3>
            <p>
              Build only the factions, stakes, and movable pieces that survive contact
              with player choices. Skip lore that never reaches the table.
            </p>
          </article>
          <article>
            <h3>The character needs a live wire</h3>
            <p>
              Turn background material into wants, debts, suspicions, and decisions
              another player can challenge during the next session.
            </p>
          </article>
          <article>
            <h3>The table will leave the plan</h3>
            <p>
              Prepare consequence ladders and pressure questions so improvisation
              preserves agency without making the world feel weightless.
            </p>
          </article>
        </div>
      </section>

      <section className="splitBand">
        <div>
          <p className="eyebrow">The editorial contract</p>
          <h2>Every guide must earn a place behind the GM screen.</h2>
          <p>
            The answer comes first, followed by the failure mode, a usable tool, a mature
            original example, and meaningful variation. No sticker-workshop layouts, no
            borrowed worlds, and no page published merely to fill a calendar slot.
          </p>
        </div>
        <ul className="featureList">
          <li>Game Master preparation</li>
          <li>Player character craft</li>
          <li>At-table improvisation</li>
          <li>Campaign continuity</li>
          <li>Original, adult-oriented examples</li>
        </ul>
      </section>

      {publishedPages.length ? (
        <section className="publishedBand" id="guide-library">
          <p className="eyebrow">Current archive</p>
          <h2>One strong page stays. New work must clear a higher bar.</h2>
          <div className="publishedLinks">
            {publishedPages.map((page) => (
              <a href={page.path} key={page.slug}>
                <small>{page.keyword}</small>
                <strong>{page.h1}</strong>
                <span>Read the guide -&gt;</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="faqBand">
        <p className="eyebrow">FAQ</p>
        <h2>Before the next session</h2>
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
        <h2>Bring one sharper decision to the table</h2>
        <p>
          {archiveAvailable
            ? "Start with the current archive. Future pages will focus on distinct D&D player and Game Master problems, with their own voice, visual world, and table-ready tool."
            : "The Playworlds field-guide archive is being rebuilt around verified product facts. Start with the editorial lanes while the first reviewed guide completes its release checks."}
        </p>
        <a className="primaryAction" href={primaryHref}>
          {archiveAvailable ? "Open the field guide archive" : "Review the field-guide lanes"}
        </a>
      </section>
    </main>
  );
}
