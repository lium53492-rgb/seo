import assert from "node:assert/strict";
import test from "node:test";

import { requiredHomepageBuildFragments } from "../scripts/lib/homepage-build-contract.mjs";

const siteUrl = "https://guides.playworlds.ai";

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

test("homepage build contract rejects invalid active page counts", () => {
  assert.throws(
    () => requiredHomepageBuildFragments({ activePageCount: -1, siteUrl }),
    /non-negative integer/,
  );
});
