import type { PublishedSeoPage } from "@/lib/seo/types";

/**
 * A schema-3-shaped, in-memory fixture for the protected concept route.
 * `status: "published"` satisfies the renderer shape only. It deliberately
 * lives outside data/pages, fails its quality receipt, and has no editorial
 * review or served-content digest, so the page store cannot publish it without
 * the normal report, review, digest, and guarded-publisher gates.
 */
export const storyDrivenAdventurePreviewPage = {
  schemaVersion: 3,
  status: "published",
  slug: "story-driven-ai-voice-roleplay-adventure",
  path: "/story-driven-ai-voice-roleplay-adventure",
  keyword: "ai roleplay adventure",
  publishedAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  generatedFromReport: "concept-2026-08-16-story-driven-ai-voice-roleplay-adventure",
  pagePattern: "experience_explainer",
  title: "Playworlds: Voice-First AI Adventure for D&D Players",
  metaDescription:
    "Explore three original science-fantasy missions and discover Playworlds, a voice-first single-player AI adventure RPG for D&D players.",
  h1: "Choose a role in a voice-first AI adventure for D&D players.",
  heroMarkdown:
    "Playworlds is an online, single-player, voice-first AI adventure RPG. Speak or type what your character attempts, plan with an in-world companion, and face a responsive AI game master that turns each decision into the next scene.",
  primaryCta: "Wishlist Playworlds on Steam",
  architecture: {
    schemaVersion: 1,
    intent: {
      searcherJob:
        "Understand what a story-driven voice AI adventure feels like and choose a role that can act inside the opening pressure.",
      painPointId: "character_hook_gap",
      decisionToEnable:
        "Decide whether a voice-first single-player AI adventure and its role-driven scene loop fit the tabletop experience the reader wants.",
      oneSentenceAnswer:
        "Choose a role by connecting one immediate want, one dangerous secret, and one decision that exposes the character under pressure.",
      nonGoals: [
        "The original mission characters and events are editorial examples, not confirmed Playworlds campaigns, characters, or in-game scenes.",
        "This audience guide treats D&D only as an audience reference and does not claim affiliation, endorsement, licensing, or 5e compatibility.",
      ],
    },
    content: {
      archetype: "worked_examples",
      thesis:
        "A memorable AI roleplay opening gives an adult tabletop player a concrete threat, a compromised role, and a first line that forces an answer.",
      originalContribution:
        "Three original science-fantasy mission briefs show how situation, pressure, decision, first line, and voice direction work as independently retrievable passages.",
      tone:
        "Cinematic orbital horror and solar noir presented as a restrained mission archive for mature tabletop roleplayers.",
      openingMove: "scenario_in_progress",
      avoidPhrases: ["endless possibilities", "bring your imagination to life", "epic adventure awaits"],
      sections: [
        {
          id: "playable-scenario",
          role: "direct_answer",
          format: "prose",
          readerQuestion: "Threat. Role. First line.",
          uniqueTakeaway:
            "A huge world becomes playable only when its first decision is small enough to perform immediately.",
        },
        {
          id: "costume-without-pressure",
          role: "failure_analysis",
          format: "checklist",
          readerQuestion: "Why the role goes flat",
          uniqueTakeaway:
            "A visual archetype without a conflict gives the player nothing consequential to reveal through voice or action.",
        },
        {
          id: "role-signal",
          role: "framework",
          format: "steps",
          readerQuestion: "The Signal Lock",
          uniqueTakeaway:
            "Want, secret, and decision produce a role with pressure instead of a costume without a performance.",
        },
        {
          id: "first-transmission",
          role: "worked_example",
          format: "examples",
          readerQuestion: "Make the role audible",
          uniqueTakeaway:
            "A useful first line names a danger, protects one secret, and forces another character to answer.",
        },
        {
          id: "playworlds-product-truth",
          role: "next_step",
          format: "prose",
          readerQuestion: "The honest entry point",
          uniqueTakeaway:
            "The product bridge separates confirmed Steam facts from the original editorial mission examples.",
        },
      ],
      faqs: [
        {
          id: "faq-definition",
          job: "definition",
          readerObstacle: "The reader does not yet know what kind of product Playworlds is.",
          answerBoundary: "Define the announced product using only the approved Steam listing facts.",
        },
        {
          id: "faq-input",
          job: "setup",
          readerObstacle: "The reader assumes a voice-first game always requires a microphone.",
          answerBoundary: "State the optional microphone and text-input facts without adding device claims.",
        },
        {
          id: "faq-persistence",
          job: "decision",
          readerObstacle: "The reader wants to know whether a campaign can continue across sessions.",
          answerBoundary: "State only the announced create, save, and resume feature direction.",
        },
        {
          id: "faq-dnd-boundary",
          job: "constraint",
          readerObstacle: "The D&D audience reference could be mistaken for a compatibility claim.",
          answerBoundary: "Separate the intended audience from affiliation, licensing, endorsement, and 5e claims.",
        },
        {
          id: "faq-release",
          job: "troubleshooting",
          readerObstacle: "The reader may mistake an upcoming listing for current availability.",
          answerBoundary: "Describe the observed Q3 2026 Early Access timing as changeable and upcoming.",
        },
      ],
      signature: {
        id: "three-mission-signal-archive",
        type: "scenario",
        readerAction: "Three doors into the dark",
        afterSectionId: "playable-scenario",
      },
    },
    differentiation: { against: [] },
    presentation: {
      recipeId: "story-driven-adventure-v1",
      rendererId: "story_driven_adventure",
      visualSystemId: "story-driven-adventure",
      layoutId: "fractured-signal-mission-archive",
      paletteId: "black-ice-signal-cyan",
      typographyId: "orbital-display-telemetry",
      motifId: "role-signal-lock",
      companion: "none",
      gallery: "none",
      surfaceCopy: {
        eyebrow: "Playworlds / AI adventure RPG for D&D players",
        shortAnswerLabel: "A signal from Mars is waiting. How will you answer?",
        contentsLabel: "Mission archive / Three original scenarios",
        sectionLabel: "Signal brief",
        faqEyebrow: "Debrief / FAQ",
        faqHeading: "AI roleplay adventure FAQ",
        relatedHeading: "Continue through the Playworlds field guide",
        finalCtaEyebrow: "System boundary / Product truth",
        finalCtaHeading: "Choose a role. Speak the next move.",
        finalCtaBody:
          "Wishlist Playworlds on Steam if a voice-first single-player AI adventure fits the experience you want.",
        backToTop: "Return to signal",
      },
    },
  },
  signatureModule: {
    id: "three-mission-signal-archive",
    type: "scenario",
    title: "Three original science-fantasy campaign scenarios",
    intro:
      "Each scenario can stand alone: the situation names the danger, the role creates the point of view, and the first line turns atmosphere into action.",
    items: [
      {
        label: "MISSION 01 / SIGNAL HORROR",
        title: "The relay that learned your voice",
        bodyMarkdown:
          "**Role:** Ilexa Vant - nightglass pilot\n\n**Situation:** A dead orbital relay begins broadcasting a rescue request in Ilexa's voice. The colony beyond it has nine minutes of shield power left.\n\n**Pressure:** Her ship can cross the radiation storm only once, and its blood-engine is already failing.\n\n**Decision:** Cross for the voices that may be alive, or preserve the ship for the evacuation route behind her.\n\n**First line:** Keep the channel open. If it learned my voice, it learned what I came back for.\n\n**Voice direction:** Low tempo. Exact coordinates. Every promise sounds expensive.",
      },
      {
        label: "MISSION 02 / MEMORY CRIME",
        title: "The memory that refuses delivery",
        bodyMarkdown:
          "**Role:** Moro Qel - rift courier\n\n**Situation:** Moro carries the last memory of a vanished planet inside a sealed neural vault. Hours before delivery, the memory starts asking him questions.\n\n**Pressure:** The recipient funded the expedition that destroyed the planet, but opening the vault will erase its chain of evidence.\n\n**Decision:** Complete the delivery, expose the recipient, or let the memory choose what survives.\n\n**First line:** That is not cargo speaking. That is a witness deciding whether I deserve the truth.\n\n**Voice direction:** Fast fragments. Deflects names. Goes still when the vault answers back.",
      },
      {
        label: "MISSION 03 / SOLAR NOIR",
        title: "The last city wants your sun",
        bodyMarkdown:
          "**Role:** Calyx Orra - solar guardian\n\n**Situation:** An eclipse locks the final orbital city in permanent night. Calyx carries enough stellar charge to wake either the shield or the escape fleet.\n\n**Pressure:** The city council claims the fleet is empty. A private transmission says twelve thousand people are already aboard.\n\n**Decision:** Protect the city, power the escape, or expose the lie before both systems fail.\n\n**First line:** I have one sunrise left. Tell me who decided the passengers were worth hiding.\n\n**Voice direction:** Measured commands. No wasted words. One breath before an irreversible order.",
      },
    ],
  },
  ipBoundary: {
    schemaVersion: 1,
    contentBasis: "original_tabletop_fantasy",
    dndReferenceScope: "audience_reference_only",
    srdMaterialUsed: false,
    thirdPartyNames: [],
  },
  sections: [
    {
      id: "playable-scenario",
      role: "direct_answer",
      format: "prose",
      heading: "What makes a sci-fi campaign scenario playable for D&D players?",
      bodyMarkdown:
        "A playable sci-fi roleplay scenario gives the reader one irreversible threat, one role with incomplete information, and one line that can change the scene. The world can be enormous, but the opening decision must be small enough to perform now.\n\nPlayworlds begins with a signal from Mars. The missions below are separate, original editorial examples: they demonstrate a useful scenario structure, but they are not confirmed Playworlds campaigns, characters, or in-game scenes.",
    },
    {
      id: "costume-without-pressure",
      role: "failure_analysis",
      format: "checklist",
      heading: "Why does a dramatic role still feel empty in play?",
      bodyMarkdown:
        "A dramatic silhouette is not yet a playable role. The opening goes flat when the character has no immediate want, no costly information to protect, or no decision that can change the scene. Those omissions leave the player describing a costume instead of performing a point of view.\n\n- **No immediate want:** The role can admire the world but cannot alter it.\n- **No dangerous secret:** Every line can be said safely, so voice carries no tension.\n- **No exposing decision:** The scene supplies atmosphere without testing what this character will sacrifice.",
    },
    {
      id: "role-signal",
      role: "framework",
      format: "steps",
      heading: "How do D&D players choose a role for an AI adventure?",
      bodyMarkdown:
        "Choose a role by locking three signals together. Costume creates the silhouette; pressure creates the performance. The framework keeps an opening role specific enough to act without requiring a complete biography or a borrowed setting.\n\n1. **Want:** What must change before this scene ends? Name an immediate result the character cannot postpone.\n2. **Secret:** What truth makes speaking dangerous? Keep one fact that changes how every line is heard.\n3. **Decision:** What choice reveals the real character? Put the want and secret into conflict before the scene can safely continue.",
    },
    {
      id: "first-transmission",
      role: "worked_example",
      format: "examples",
      heading: "How do you find the character's first line?",
      bodyMarkdown:
        "A first line should not explain the entire world. It should make another character - or the listener - need to answer. Build it from one concrete danger, one protected fact, and one audible choice.\n\n1. **Name the danger:** Use one concrete object, deadline, location, or signal already pressing on the role.\n2. **Protect the secret:** Let the line bend around what cannot be confessed without removing all useful context.\n3. **Force an answer:** End with a decision, accusation, order, or impossible question that makes silence consequential.",
    },
    {
      id: "playworlds-product-truth",
      role: "next_step",
      format: "prose",
      heading: "What kind of AI adventure RPG is Playworlds?",
      bodyMarkdown:
        "Playworlds is an online, single-player, voice-first AI adventure RPG. You can speak or type what your character attempts, plan with an in-world companion, and respond to an AI game master that interprets actions, describes outcomes, and presents new choices, risks, and opportunities.\n\nThe announced Early Access journey begins with a signal from Mars. Campaigns can be created, saved, and resumed, while RPG state covers player and party status, action resolution, dice results, inventory, and journey history. Generated dialogue and narration are paired with captions and conversation history.\n\nSteam listed Playworlds as an upcoming Q3 2026 Early Access release when this concept was researched. The product remains under active development, and generated dialogue, narration, and gameplay responses can vary. The three missions on this page remain editorial examples rather than confirmed in-game content.",
    },
  ],
  faqs: [
    {
      id: "faq-definition",
      job: "definition",
      question: "What is Playworlds?",
      answerMarkdown:
        "Playworlds is an online, single-player, voice-first AI adventure RPG. A player states a character's action by voice or text, plans with an in-world AI companion, and responds as the game master turns decisions into new scenes.",
    },
    {
      id: "faq-input",
      job: "setup",
      question: "Can I play Playworlds without a microphone?",
      answerMarkdown:
        "Yes. The official Steam listing describes both voice and keyboard text input and says a microphone is optional, so voice is not the only announced input path.",
    },
    {
      id: "faq-persistence",
      job: "decision",
      question: "Does Playworlds support persistent campaigns?",
      answerMarkdown:
        "The announced Early Access feature set includes creating, saving, and resuming campaigns, plus player and party status, action resolution, dice results, inventory, and journey history.",
    },
    {
      id: "faq-dnd-boundary",
      job: "constraint",
      question: "Is Playworlds affiliated with D&D or designed as a 5e rules product?",
      answerMarkdown:
        "No such relationship is claimed here. This page addresses adult D&D players and tabletop roleplayers, while Playworlds is presented as its own original AI adventure RPG without an affiliation, endorsement, license, or 5e compatibility claim.",
    },
    {
      id: "faq-release",
      job: "troubleshooting",
      question: "When is Playworlds coming to Steam?",
      answerMarkdown:
        "Steam listed Playworlds for Q3 2026 as an upcoming Early Access release when this concept was researched. Timing can change while the product remains under active development.",
    },
  ],
  factIdsUsed: [
    "playworlds-current-product",
    "dnd-content-direction",
    "dnd-primary-audience",
    "playworlds-voice-text-single-player-rpg",
    "playworlds-ai-game-master",
    "playworlds-in-world-companion",
    "playworlds-persistent-campaigns",
    "playworlds-rpg-state",
  ],
  internalLinks: [],
  assetBriefs: [
    "Original science-fiction role Ilexa Vant stands inside a fractured orbital signal beneath an eclipse.",
  ],
  quality: {
    passed: false,
    wordCount: 0,
    checks: [
      {
        id: "concept-only",
        label: "Concept only",
        passed: false,
        detail: "This in-memory preview has not passed the report, editorial review, or publisher gates.",
      },
    ],
  },
  research: {
    opportunityScore: 0,
    demandProxy: 0,
    competitionProxy: 0,
    evidenceCount: 0,
  },
} satisfies PublishedSeoPage;
