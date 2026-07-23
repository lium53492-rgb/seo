import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { scoreResearchCandidate } from "../scripts/lib/seo-policy.mjs";

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
  searcherJob: "Enter an original AI roleplay story now and compare whether the format is worth trying.",
  productFactIds: [
    "voice-roleplay-format",
    "existing-story",
    "role-selection",
    "interactive-fiction-history",
  ],
  productSignals: [
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
  keyword: "play an ai roleplay story",
  seed: "ai roleplay story",
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
