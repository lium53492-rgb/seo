import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { requiredHomepageBuildFragments } from "../scripts/lib/homepage-build-contract.mjs";

const siteUrl = "https://lorelens.playworlds.ai";
const root = dirname(dirname(fileURLToPath(import.meta.url)));

function labelsFor(activePageCount) {
  return requiredHomepageBuildFragments({ activePageCount, siteUrl }).map(([, label]) => label);
}

test("zero active pages do not require a guide-library fragment", () => {
  assert.equal(labelsFor(0).includes("guide library"), false);
});

test("one or more active pages still require a guide-library fragment", () => {
  assert.equal(labelsFor(1).includes("guide library"), true);
  assert.equal(labelsFor(3).includes("guide library"), true);
});

test("homepage initial HTML always requires the centralized original-only D&D notice", () => {
  for (const activePageCount of [0, 1]) {
    const labels = labelsFor(activePageCount);
    assert.equal(labels.includes("original-only D&D notice"), true);
    assert.equal(labels.includes("SRD material boundary"), true);
    assert.equal(labels.includes("D&D independence notice heading"), true);
    assert.equal(labels.includes("D&D independence notice body"), true);
  }
});

test("homepage gives the current comparison a descriptive crawlable entry", () => {
  const source = readFileSync(join(root, "app", "page.tsx"), "utf8");
  assert.match(source, /featuredComparisonSlug\s*=\s*"ai-game-master-vs-chatbot-for-tabletop-campaign"/);
  assert.match(source, /"AI Game Master vs Chatbot"/);
  assert.match(source, /"Read AI Game Master vs Chatbot"/);
});

test("homepage build contract rejects invalid active page counts", () => {
  assert.throws(
    () => requiredHomepageBuildFragments({ activePageCount: -1, siteUrl }),
    /non-negative integer/,
  );
});
