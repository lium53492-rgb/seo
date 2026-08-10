import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { scoreResearchCandidate } from "../scripts/lib/seo-policy.mjs";
import { audienceDraftBlockers } from "../lib/seo/audience-policy.mjs";

const policy = JSON.parse(await readFile(new URL("../data/config/seo-policy.json", import.meta.url), "utf8"));
const rationale = Object.fromEntries([
  "demand",
  "difficulty",
  "productFit",
  "trialIntent",
  "revenueIntent",
  "intentSpecificity",
  "originality",
  "ipRisk",
  "cannibalizationRisk",
].map((field) => [
  field,
  `The ${field} judgment is tied to the cited search evidence and the explicit searcher job.`,
]));
const strongDecisionEvidence = {
  schemaVersion: 1,
  evidenceRefs: ["search-result-one", "search-result-two"],
  searcherJob: "Help an adult D&D Game Master reduce campaign-prep pressure before tonight's tabletop session, then decide whether this focused workflow is worth trying now.",
  productFactIds: [
    "dnd-content-direction",
    "dnd-primary-audience",
    "voice-roleplay-format",
    "existing-story",
    "role-selection",
    "interactive-fiction-history",
  ],
  productSignals: [
    "dnd_content",
    "adult_tabletop_audience",
    "voice_roleplay",
    "story_premise",
    "role_selection",
    "interactive_fiction",
  ],
  trialSignals: [
    "solution_aware",
    "immediate_use",
    "experience_seeking",
    "action_language",
  ],
  revenueSignals: [
    "commercial_comparison",
    "alternative_seeking",
    "recurring_use",
  ],
  specificitySignals: [
    "defined_task",
    "defined_format",
    "defined_audience",
    "narrow_modifier",
  ],
  ipClass: "original_generic",
  cannibalizationClass: "new_intent",
  nearestExistingSlug: null,
  rationale,
};
const strongCandidate = {
  keyword: "adult d&d game master campaign prep workflow",
  seed: "d&d campaign prep",
  demandScore: 78,
  difficulty: 28,
  intent: "transactional",
  funnelStage: "trial",
  conversionGoal: "trial_start",
  productFit: 94,
  originality: 86,
  conversionIntent: 91,
  trialIntent: 91,
  revenueIntent: 76,
  intentSpecificity: 92,
  ipRisk: 0,
  cannibalizationRisk: 8,
  decisionEvidence: strongDecisionEvidence,
};

test("revenue-first policy creates a page only for a strong trial job", () => {
  const result = scoreResearchCandidate(strongCandidate, policy);
  assert.equal(result.gate.passed, true);
  assert.equal(result.action, "create_page");
  assert.ok(result.score >= policy.createPageThreshold);
  assert.equal(result.scoreBasis, "evidence_signals_v1");
  assert.equal(result.productFit, 100);
  assert.equal(result.trialIntent, 100);
  assert.equal(result.revenueIntent, 70);
  assert.equal(result.cannibalizationRisk, 10);
});

test("broad informational demand cannot pass on traffic proxy alone", () => {
  const result = scoreResearchCandidate({
    ...strongCandidate,
    keyword: "what is roleplay",
    intent: "informational",
    funnelStage: "problem",
    conversionGoal: "qualified_outbound_click",
    demandScore: 98,
    trialIntent: 35,
    revenueIntent: 20,
    intentSpecificity: 40,
    decisionEvidence: {
      ...strongDecisionEvidence,
      searcherJob: "Understand the broad definition of roleplay without seeking a product experience or next step.",
      trialSignals: ["solution_aware"],
      revenueSignals: [],
      specificitySignals: ["defined_task"],
    },
  }, policy);
  assert.equal(result.gate.passed, false);
  assert.equal(result.action, "observe");
  assert.match(result.reason, /trial intent|search intent|funnel stage/);
});

test("a future page cannot bypass the D&D-first audience direction", () => {
  const result = scoreResearchCandidate({
    ...strongCandidate,
    decisionEvidence: {
      ...strongDecisionEvidence,
      productSignals: strongDecisionEvidence.productSignals.filter((signal) => signal !== "dnd_content"),
      productFactIds: strongDecisionEvidence.productFactIds.filter((factId) => factId !== "dnd-content-direction"),
    },
  }, policy);
  assert.equal(result.productFit, 100);
  assert.equal(result.gate.passed, false);
  assert.match(result.reason, /primary audience requires product signal dnd_content/);
});

test("a concrete campaign job without a D&D/tabletop audience cannot pass", () => {
  const result = scoreResearchCandidate({
    ...strongCandidate,
    keyword: "campaign session prep workflow",
    decisionEvidence: {
      ...strongDecisionEvidence,
      searcherJob: "Help an adult facilitator prepare a campaign session and choose an opening encounter without naming a specific hobby audience.",
    },
  }, policy);
  assert.equal(result.gate.passed, false);
  assert.match(result.reason, /does not name the D&D\/tabletop audience/);
});

test("a D&D/tabletop audience label without a concrete table job cannot pass", () => {
  const result = scoreResearchCandidate({
    ...strongCandidate,
    keyword: "adult d&d tabletop guide",
    decisionEvidence: {
      ...strongDecisionEvidence,
      searcherJob: "Help an adult D&D tabletop reader understand the hobby and decide whether this general guide is worth reading now.",
    },
  }, policy);
  assert.equal(result.gate.passed, false);
  assert.match(result.reason, /does not name a player or Game Master table job/);
});

test("the audience gate starts on its configured report date and missing context fails closed", () => {
  const genericCandidate = {
    ...strongCandidate,
    keyword: "general roleplay guide",
    decisionEvidence: {
      ...strongDecisionEvidence,
      searcherJob: "Compare two general roleplay formats and decide whether the selected format is worth trying now.",
    },
  };
  assert.equal(
    scoreResearchCandidate(genericCandidate, policy, { reportDate: "2026-08-10" }).gate.passed,
    true,
  );
  assert.equal(
    scoreResearchCandidate(genericCandidate, policy, { reportDate: "2026-08-11" }).gate.passed,
    false,
  );
  assert.equal(scoreResearchCandidate(genericCandidate, policy).gate.passed, false);
  const invalidDate = scoreResearchCandidate(strongCandidate, policy, { reportDate: "not-a-date" });
  assert.equal(invalidDate.gate.passed, false);
  assert.match(invalidDate.reason, /requires a valid report date/);
});

test("draft tone requires both mature positioning and a tabletop domain", () => {
  const architecture = {
    intent: {
      searcherJob: strongDecisionEvidence.searcherJob,
      painPointId: "campaign_prep_overload",
    },
    content: {
      sections: policy.audienceStrategy.requiredSectionRoles.map((role) => ({ role })),
      tone: "Mature adult tabletop field notes for a time-pressed D&D Game Master.",
    },
  };
  const baseInput = {
    policy,
    reportDate: policy.audienceStrategy.enforcedFromReportDate,
    keyword: strongCandidate.keyword,
    h1: "Run Tonight's D&D Campaign With Less Prep",
    factIds: strongDecisionEvidence.productFactIds,
    architecture,
  };
  assert.deepEqual(audienceDraftBlockers(baseInput), []);

  const disguisedChildCopy = audienceDraftBlockers({
    ...baseInput,
    visibleText: "A cute mascot leads kids through a sticker workshop while the metadata says mature tabletop.",
  });
  assert.ok(disguisedChildCopy.some((blocker) => /child-directed framing/.test(blocker)));

  const outOfOrderLayers = audienceDraftBlockers({
    ...baseInput,
    architecture: {
      ...architecture,
      content: {
        ...architecture.content,
        sections: [
          { role: "direct_answer" },
          { role: "framework" },
          { role: "failure_analysis" },
          { role: "worked_example" },
          { role: "next_step" },
        ],
      },
    },
  });
  assert.ok(outOfOrderLayers.some((blocker) => /must keep this order/.test(blocker)));

  const childDirected = audienceDraftBlockers({
    ...baseInput,
    architecture: {
      ...architecture,
      content: {
        ...architecture.content,
        tone: "Playful child-directed campaign fun with bright mascot energy.",
      },
    },
  });
  assert.ok(childDirected.some((blocker) => /adult or mature audience/.test(blocker)));
  assert.ok(!childDirected.some((blocker) => /tabletop campaign domain/.test(blocker)));

  const matureButGeneric = audienceDraftBlockers({
    ...baseInput,
    architecture: {
      ...architecture,
      content: {
        ...architecture.content,
        tone: "Mature adult editorial analysis for experienced readers.",
      },
    },
  });
  assert.ok(!matureButGeneric.some((blocker) => /adult or mature audience/.test(blocker)));
  assert.ok(matureButGeneric.some((blocker) => /tabletop campaign domain/.test(blocker)));
});

test("an owned intent consolidates instead of creating a duplicate page", () => {
  const result = scoreResearchCandidate({
    ...strongCandidate,
    existingUrl: "/play-an-ai-roleplay-story",
    cannibalizationRisk: 90,
    decisionEvidence: {
      ...strongDecisionEvidence,
      cannibalizationClass: "same_intent",
      nearestExistingSlug: "play-an-ai-roleplay-story",
    },
  }, policy);
  assert.equal(result.action, "consolidate");
  assert.equal(result.gate.passed, false);
});

test("AI-supplied perfect scores cannot bypass weak evidence signals", () => {
  const result = scoreResearchCandidate({
    ...strongCandidate,
    productFit: 100,
    trialIntent: 100,
    revenueIntent: 100,
    intentSpecificity: 100,
    originality: 100,
    ipRisk: 0,
    cannibalizationRisk: 0,
    decisionEvidence: {
      ...strongDecisionEvidence,
      productFactIds: ["voice-roleplay-format"],
      productSignals: ["voice_roleplay"],
      trialSignals: [],
      revenueSignals: [],
      specificitySignals: ["defined_task"],
    },
  }, policy);
  assert.equal(result.productFit, 30);
  assert.equal(result.trialIntent, 0);
  assert.equal(result.revenueIntent, 0);
  assert.equal(result.intentSpecificity, 30);
  assert.equal(result.gate.passed, false);
  assert.equal(result.action, "observe");
});

test("a selected product signal must cite its approved fact ID", () => {
  assert.throws(() => scoreResearchCandidate({
    ...strongCandidate,
    decisionEvidence: {
      ...strongDecisionEvidence,
      productFactIds: [],
    },
  }, policy), /requires approved fact ID/);
});
