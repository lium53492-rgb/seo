import type { PublishedSeoPage } from "@/lib/seo/types";

/**
 * Protected, noindex concept data. This deliberately stays outside data/pages
 * and cannot become public without the normal research, review, digest, and
 * guarded-publisher path.
 */
export const aiGameMasterVsChatbotPreviewPage = {
  schemaVersion: 3,
  status: "published",
  slug: "ai-game-master-vs-chatbot-for-tabletop-campaign",
  path: "/ai-game-master-vs-chatbot-for-tabletop-campaign",
  keyword: "ai game master vs chatbot for tabletop campaign",
  publishedAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
  generatedFromReport: "concept-2026-08-18-ai-game-master-vs-chatbot-for-dnd",
  pagePattern: "decision_page",
  title: "AI Game Master vs Chatbot: 4 Differences for D&D Players",
  metaDescription:
    "Use the Campaign Loop Test to compare action resolution, consequences, persistent state, and next choices—then decide what fits your solo campaign.",
  h1: "AI Game Master vs Chatbot: Which One Fits a D&D Campaign?",
  heroMarkdown:
    "Choose an AI game master when actions must change campaign state and produce consequential choices. Choose a chatbot for conversation or brainstorming without that loop.",
  primaryCta: "Check Playworlds against the Campaign Loop Test",
  architecture: {
    schemaVersion: 1,
    intent: {
      searcherJob:
        "Compare a general AI chatbot with a dedicated AI game master before choosing a tool for an adult D&D campaign.",
      painPointId: "campaign_prep_overload",
      decisionToEnable:
        "Decide whether the reader needs flexible conversation or a persistent action-outcome-state-choice loop for campaign play.",
      oneSentenceAnswer:
        "A chatbot discusses campaigns; an AI game master resolves actions, preserves state, and presents the next decision.",
      nonGoals: [
        "D&D identifies the intended audience only; product-relationship and edition-compatibility claims are outside this page.",
        "Do not reproduce D&D rules, settings, characters, monsters, artwork, maps, or adventure text.",
      ],
    },
    content: {
      archetype: "comparison",
      thesis:
        "The difference is not prettier prose; it is whether each response completes a playable campaign loop.",
      originalContribution:
        "The Campaign Loop Test compares action interpretation, outcome, persistent state, and the next choice through one original tabletop-fantasy scene.",
      tone:
        "Adult tabletop field analysis with a midnight-blue campaign-control-room presentation and concise, answer-first passages that remain understandable in isolation.",
      openingMove: "direct_answer",
      avoidPhrases: [
        "endless possibilities",
        "epic adventure awaits",
        "bring your imagination to life",
      ],
      sections: [
        {
          id: "practical-difference",
          role: "direct_answer",
          format: "comparison",
          readerQuestion: "The decision in one minute",
          uniqueTakeaway:
            "The dividing line is a maintained campaign loop, not whether both tools can produce fantasy prose.",
        },
        {
          id: "eloquent-but-unplayable",
          role: "failure_analysis",
          format: "prose",
          readerQuestion: "Why good writing can still fail at the table",
          uniqueTakeaway:
            "A polished reply is not playable when it fails to resolve the action, preserve the new state, or create a next decision.",
        },
        {
          id: "campaign-loop-test",
          role: "framework",
          format: "steps",
          readerQuestion: "A four-part test for any AI tool",
          uniqueTakeaway:
            "Action, outcome, state, and next choice expose whether a system is chatting about a campaign or running a coherent scene loop.",
        },
        {
          id: "locked-chapel-example",
          role: "worked_example",
          format: "examples",
          readerQuestion: "One original scene, two different responses",
          uniqueTakeaway:
            "The worked example shows how state continuity changes the next playable choice without borrowing D&D rules or setting content.",
        },
        {
          id: "choose-the-right-tool",
          role: "next_step",
          format: "checklist",
          readerQuestion: "Choose by the experience you actually want",
          uniqueTakeaway:
            "Use a chatbot for open-ended ideation and a dedicated AI game master when campaign state and consequential play are the priority.",
        },
      ],
      faqs: [
        {
          id: "faq-definition",
          job: "definition",
          readerObstacle: "The reader assumes every fantasy chatbot is already an AI game master.",
          answerBoundary: "Define the category through the campaign loop rather than unsupported marketing claims.",
        },
        {
          id: "faq-replacement",
          job: "constraint",
          readerObstacle: "The reader may expect an AI tool to replace a human Dungeon Master in every group.",
          answerBoundary: "Explain the single-player Playworlds context without making a universal replacement claim.",
        },
        {
          id: "faq-input",
          job: "setup",
          readerObstacle: "The reader may assume voice-first means a microphone is mandatory.",
          answerBoundary: "Use the approved voice-or-text and optional-microphone facts only.",
        },
        {
          id: "faq-ip",
          job: "constraint",
          readerObstacle: "The audience reference could be mistaken for a product relationship.",
          answerBoundary: "State the original-only, independent audience boundary clearly.",
        },
      ],
      signature: {
        id: "campaign-loop-test",
        type: "comparison",
        readerAction: "Run the Campaign Loop Test",
        afterSectionId: "campaign-loop-test",
      },
    },
    differentiation: { against: [] },
    presentation: {
      recipeId: "campaign-state-comparison-v1",
      rendererId: "campaign_state_comparison",
      visualSystemId: "campaign-state-console",
      layoutId: "split-turn-trace",
      paletteId: "lampblack-ember",
      typographyId: "campaign-serif-ledger",
      motifId: "action-outcome-state-choice",
      companion: "none",
      gallery: "none",
      surfaceCopy: {
        eyebrow: "Playworlds / Campaign decision field guide",
        shortAnswerLabel: "Chat about the world, or keep the world moving?",
        contentsLabel: "Campaign control / Decision routes",
        sectionLabel: "Independent field note",
        faqEyebrow: "Table ruling / FAQ",
        faqHeading: "AI game master vs chatbot FAQ",
        relatedHeading: "More Playworlds field guides",
        finalCtaEyebrow: "Product boundary / Current public listing",
        finalCtaHeading: "See the AI game master loop described for Playworlds.",
        finalCtaBody:
          "Playworlds is described as a single-player AI adventure RPG with voice or text, an AI game master, saved campaigns, and tracked RPG state.",
        backToTop: "Return to campaign control",
      },
    },
  },
  signatureModule: {
    id: "campaign-loop-test",
    type: "comparison",
    title: "The Campaign Loop Test",
    intro:
      "Read each checkpoint alone. A campaign system connects all four; polished prose cannot repair missing state.",
    items: [
      {
        label: "01 / ACTION",
        title: "Does the system understand the player's attempt?",
        bodyMarkdown:
          "**General chatbot:** Paraphrases the request or continues the conversation.\n\n**AI game master:** Interprets the attempt inside the current scene, including intent and risk.",
      },
      {
        label: "02 / OUTCOME",
        title: "Does the answer create a consequence?",
        bodyMarkdown:
          "**General chatbot:** May write vivid prose without deciding what changed.\n\n**AI game master:** Resolves an uncertainty and creates a pressure, opportunity, or cost.",
      },
      {
        label: "03 / STATE",
        title: "Will the changed state matter next turn?",
        bodyMarkdown:
          "**General chatbot:** Keeps important details as conversational context.\n\n**AI game master:** Carries party condition, inventory, resolved actions, and journey history into continuing play.",
      },
      {
        label: "04 / NEXT CHOICE",
        title: "Does the response return control?",
        bodyMarkdown:
          "**General chatbot:** May end with an explanation or broad question.\n\n**AI game master:** Reveals a specific choice, risk, or opportunity the player can act on.",
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
      id: "practical-difference",
      role: "direct_answer",
      format: "comparison",
      heading: "What is the practical difference between an AI game master and a chatbot for D&D players?",
      bodyMarkdown:
        "For D&D play, an AI game master and a chatbot do different jobs after the player acts.\n\n- **General chatbot:** Supports brainstorming or dialogue without resolving campaign state.\n- **AI game master:** Interprets the attempt, resolves its outcome, preserves state, and presents the next consequential choice.\n\nChoose a chatbot for conversation. Choose an AI game master when one decision must become the next scene's starting state.",
    },
    {
      id: "eloquent-but-unplayable",
      role: "failure_analysis",
      format: "prose",
      heading: "Why can an eloquent chatbot still feel weak during a tabletop campaign?",
      bodyMarkdown:
        "An eloquent chatbot can fail a tabletop campaign because polished prose is not persistent state. It may leave the player's action unresolved.\n\nIf the player must restate danger, inventory, and the last outcome, the tool is writing around the campaign. An AI game master preserves consequence and returns a specific decision.",
    },
    {
      id: "campaign-loop-test",
      role: "framework",
      format: "steps",
      heading: "How can you test an AI tool before trusting it with a D&D campaign?",
      bodyMarkdown:
        "For D&D campaign play, the Campaign Loop Test separates an AI game master from a chatbot with four checkpoints.\n\n1. **Action:** Name the attempt, intent, and risk.\n2. **Outcome:** Confirm what happened and what pressure, opportunity, or cost followed.\n3. **State:** Identify what persists into the next turn.\n4. **Next choice:** Require a concrete decision that returns agency.\n\nEach works alone; together they reveal a coherent campaign loop.",
    },
    {
      id: "locked-chapel-example",
      role: "worked_example",
      format: "examples",
      heading: "What does the Campaign Loop Test look like in an original fantasy scene?",
      bodyMarkdown:
        "Compare an AI chatbot and an AI game master with one original tabletop-fantasy scene.\n\n- **Scene:** In a storm, a medicine courier reaches a locked chapel. The caretaker refuses entry after its bell rang alone.\n- **Chat-shaped response:** Describes the rain without deciding what changed.\n- **Campaign-shaped response:** The caretaker trusts the medicine, recognizes the courier's seal, says the tunnel is flooded, and demands collateral. Persistent state: surrendered resource, blocked route, exposed identity. Next choice: explain the seal or seek another road.\n\nThis original example contains no D&D rules or setting content.",
    },
    {
      id: "choose-the-right-tool",
      role: "next_step",
      format: "checklist",
      heading: "When should a D&D player choose a chatbot, and when should they choose an AI game master?",
      bodyMarkdown:
        "For a D&D player, choose by what must persist after the reply.\n\n- **Choose conversation** when names or dialogue matter more than continuity.\n- **Choose a campaign loop** when inventory, party condition, actions, and history must stay connected.\n- **Check the next turn:** The reply should state what changed and what decision follows.\n\nPlayworlds' public listing describes voice or text actions, an AI game master, saved campaigns, and tracked RPG state in a single-player AI adventure RPG. D&D identifies this independent guide's adult audience; it does not imply affiliation or rules compatibility.",
    },
  ],
  faqs: [
    {
      id: "faq-definition",
      job: "definition",
      question: "Is every fantasy AI chatbot an AI game master?",
      answerMarkdown:
        "A fantasy chatbot is not automatically an AI game master. Fantasy tone alone cannot resolve action, preserve state, and return a specific choice.",
    },
    {
      id: "faq-replacement",
      job: "constraint",
      question: "Does an AI game master replace a human Dungeon Master?",
      answerMarkdown:
        "An AI game master does not universally replace a human Dungeon Master. Playworlds is described for solo play, which is the scope of this comparison.",
    },
    {
      id: "faq-input",
      job: "setup",
      question: "Does Playworlds require voice input?",
      answerMarkdown:
        "Playworlds does not require voice input. Its official listing describes voice or keyboard input and says a microphone is optional.",
    },
    {
      id: "faq-ip",
      job: "constraint",
      question: "What does the D&D reference mean on this page?",
      answerMarkdown:
        "Here, D&D identifies the adult audience. The original example contains no D&D rules or setting content, and the page claims no compatibility or affiliation.",
    },
  ],
  factIdsUsed: [
    "playworlds-current-product",
    "dnd-content-direction",
    "dnd-primary-audience",
    "playworlds-voice-text-single-player-rpg",
    "playworlds-ai-game-master",
    "playworlds-persistent-campaigns",
    "playworlds-rpg-state",
  ],
  internalLinks: [],
  assetBriefs: [],
  quality: {
    passed: false,
    wordCount: 0,
    checks: [
      {
        id: "concept-only",
        label: "Concept only",
        passed: false,
        detail: "This protected preview has not passed a same-day report, editorial review, or guarded publisher.",
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
