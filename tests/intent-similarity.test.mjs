import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeCandidateIntentBatch,
  compareIntentText,
  findPublishedIntentMatch,
  intentFingerprint,
  publishedIntentRecords,
} from "../scripts/lib/intent-similarity.mjs";

function candidate(keyword, searcherJob, cannibalizationClass = "new_intent") {
  return {
    keyword,
    decisionEvidence: {
      searcherJob,
      cannibalizationClass,
      nearestExistingSlug: null,
    },
  };
}

test("semantic normalization fingerprints paraphrased first-reply intent", () => {
  const comparison = compareIntentText(
    "write an AI roleplay first response",
    "AI Roleplay First Message: Start With a Scene, Not a Script",
  );
  assert.equal(comparison.nearDuplicate, true);
  assert.equal(comparison.taskFingerprint, "first_reply");
  assert.match(intentFingerprint("Opening roleplay response"), /first_reply/);
  assert.equal(
    compareIntentText("play an ai roleplay story", "Story-Based AI Roleplay").nearDuplicate,
    true,
  );
  assert.equal(
    compareIntentText("write an ai roleplay first reply", "Story-Based AI Roleplay").nearDuplicate,
    false,
  );
});

test("candidate batch counts semantic intent clusters rather than unique strings", () => {
  const candidates = [
    candidate("play an ai roleplay story", "Enter an AI roleplay story now and decide whether the format is worth trying."),
    candidate("start an ai voice story", "Begin an AI voice roleplay story and evaluate whether the experience fits."),
    candidate("write an ai roleplay first reply", "Write one first AI roleplay response with a detail, action, and hook."),
  ];
  const result = analyzeCandidateIntentBatch(candidates);
  assert.equal(result.distinctCount, 2);
  assert.equal(result.collisions.length, 1);
  assert.equal(result.collisions[0].comparison.nearDuplicate, true);
});

test("published intent matching inspects keyword, H1, page architecture, and report searcher job", () => {
  const pages = [{
    status: "published",
    slug: "ai-roleplay-first-message",
    path: "/ai-roleplay-first-message",
    keyword: "ai roleplay first message",
    h1: "AI Roleplay First Message: Start With a Scene, Not a Script",
    architecture: {
      intent: {
        searcherJob: "Write a first AI roleplay reply after a supplied scene gives the opening context.",
      },
    },
  }];
  const reports = [{
    publication: { status: "published", slug: "ai-roleplay-first-message" },
    contentStrategy: {
      searcherJob: "Turn one prepared scene detail into the opening reply for a selected role.",
    },
    draft: {
      architecture: {
        intent: {
          decisionToEnable: "Choose the detail, action, and hook for the first response.",
        },
      },
    },
  }];
  const records = publishedIntentRecords(pages, reports);
  assert.deepEqual(
    new Set(records[0].fields.map((field) => field.source)),
    new Set([
      "keyword",
      "h1",
      "page.architecture.intent.searcherJob",
      "report.contentStrategy.searcherJob",
      "report.draft.architecture.intent.decisionToEnable",
    ]),
  );
  const match = findPublishedIntentMatch(
    candidate(
      "write an ai roleplay opening response",
      "Draft the first roleplay reply after the story has supplied the scene.",
    ),
    records,
  );
  assert.equal(match?.record.slug, "ai-roleplay-first-message");
  assert.equal(match?.comparison.nearDuplicate, true);
});

test("different post-entry jobs remain distinct", () => {
  const candidates = [
    candidate("recover a stalled ai roleplay scene", "Recover a stalled scene with one grounded action."),
    candidate("stay in character during ai roleplay", "Maintain the selected character perspective across the exchange."),
    candidate("set ai roleplay reply pacing", "Set response length and pacing for the current scene."),
    candidate("find a roleplay motivation", "Find one immediate motivation for the selected character."),
  ];
  assert.equal(analyzeCandidateIntentBatch(candidates).distinctCount, candidates.length);
});
