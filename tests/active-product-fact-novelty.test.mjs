import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");
const factCatalog = JSON.parse(await readSource("../data/config/product-facts.json"));
const builderSource = await readSource("../scripts/build-free-research-report.mjs");
const publisherSource = await readSource("../scripts/publish-reviewed-page.mjs");

test("new report and publication novelty exemptions use active product facts only", () => {
  const activeStatements = factCatalog.facts
    .filter((fact) => fact.status === "active")
    .map((fact) => fact.statement);
  const historicalStatements = factCatalog.facts
    .filter((fact) => fact.status === "historical_compatibility")
    .map((fact) => fact.statement);

  assert.ok(activeStatements.length > 0);
  assert.ok(historicalStatements.length > 0);

  for (const source of [builderSource, publisherSource]) {
    assert.match(source, /const activeProductFacts = factCatalog\.facts\.filter\(\(fact\) => fact\.status === "active"\);/);
    assert.match(source, /const activeFactStatements = activeProductFacts\.map\(\(fact\) => fact\.statement\);/);
    assert.match(source, /allowedPhrases: activeFactStatements,/);
    assert.doesNotMatch(source, /allowedPhrases: factCatalog\.facts\.map\(\(fact\) => fact\.statement\)/);
  }
});
