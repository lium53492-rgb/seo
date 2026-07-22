import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { scoreResearchCandidate } from "../scripts/lib/seo-policy.mjs";

const policy = JSON.parse(await readFile(new URL("../data/config/seo-policy.json", import.meta.url), "utf8"));
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
};

test("revenue-first policy creates a page only for a strong trial job", () => {
  const result = scoreResearchCandidate(strongCandidate, policy);
  assert.equal(result.gate.passed, true);
  assert.equal(result.action, "create_page");
  assert.ok(result.score >= policy.createPageThreshold);
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
  }, policy);
  assert.equal(result.action, "consolidate");
  assert.equal(result.gate.passed, false);
});
