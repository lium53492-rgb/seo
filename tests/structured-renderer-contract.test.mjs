import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("structured pages consume recipe motifs and vocabulary instead of a uniform numbered skeleton", async () => {
  const [component, presentationSource, recipes] = await Promise.all([
    read("../app/[slug]/StructuredContentPage.tsx"),
    read("../lib/seo/page-presentation.ts"),
    read("../data/config/presentation-recipes.json").then(JSON.parse),
  ]);
  assert.ok(recipes.recipes.every((recipe) =>
    typeof recipe.sectionMarkerStyle === "string" &&
    typeof recipe.sectionFlow === "string" &&
    Array.isArray(recipe.domainConcepts) && recipe.domainConcepts.length >= 5));
  assert.equal(new Set(recipes.recipes.map((recipe) => recipe.sectionMarkerStyle)).size, recipes.recipes.length);
  assert.equal(new Set(recipes.recipes.map((recipe) => recipe.sectionFlow)).size, recipes.recipes.length);
  assert.match(component, /recipe\.domainConcepts\[index % recipe\.domainConcepts\.length\]/);
  assert.match(component, /data-motif=\{recipe\.motifId\}/);
  assert.match(component, /data-section-marker-style=\{recipe\.sectionMarkerStyle\}/);
  assert.match(component, /data-section-flow=\{recipe\.sectionFlow\}/);
  assert.doesNotMatch(component, /padStart\(2,\s*["']0["']\)/);
  for (const field of ["motifId", "sectionMarkerStyle", "sectionFlow", "domainConcepts"]) {
    assert.match(presentationSource, new RegExp(`${field}: recipe\\.${field}`));
  }
});

test("hero typography has explicit desktop and mobile bounds", async () => {
  const css = await read("../app/[slug]/structured-content.module.css");
  assert.match(css, /font-size:\s*clamp\(2\.8rem,\s*6vw,\s*6\.5rem\)/);
  assert.match(css, /text-wrap:\s*balance/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.hero h1 \{ font-size: clamp\(2\.5rem, 12vw, 4\.2rem\); line-height: \.92; \}/);
  assert.doesNotMatch(css, /font-size:\s*clamp\(3\.8rem,\s*9\.5vw,\s*9\.6rem\)/);
});
