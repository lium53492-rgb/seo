import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import * as ts from "typescript";
import { visiblePageText } from "../lib/seo/served-content.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const slug = "ai-game-master-vs-chatbot-for-tabletop-campaign";
const routePath = join(root, "app", "workbench", "concepts", slug, "page.tsx");
const fixturePath = join(root, "components", "seo", "ai-game-master-vs-chatbot", "preview-page.ts");
const dossierPath = join(root, "data", "page-dossiers", `${slug}.json`);
const rendererStylesPath = join(
  root,
  "components",
  "seo",
  "ai-game-master-vs-chatbot",
  "campaign-state-comparison.module.css",
);
const shellStylesPath = join(root, "app", "[slug]", "structured-content.module.css");

test("AI game master renderer fixture remains a protected noindex preview", () => {
  const route = readFileSync(routePath, "utf8");
  assert.match(route, /isBasicAuthHeaderAuthorized/);
  assert.match(route, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  assert.match(route, /aiGameMasterVsChatbotPreviewPage/);
  assert.match(route, /mode="preview"/);
});

test("concept copy answers a distinct AI and D&D campaign decision with standalone passages", () => {
  const source = readFileSync(fixturePath, "utf8");
  for (const phrase of [
    "AI Game Master vs Chatbot: Which One Fits a D&D Campaign?",
    "The Campaign Loop Test",
    "01 / ACTION",
    "02 / OUTCOME",
    "03 / STATE",
    "04 / NEXT CHOICE",
    "What is the practical difference between an AI game master and a chatbot for D&D players?",
    "Why can an eloquent chatbot still feel weak during a tabletop campaign?",
    "What does the Campaign Loop Test look like in an original fantasy scene?",
  ]) assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

  assert.match(source, /pagePattern:\s*"decision_page"/);
  assert.match(source, /recipeId:\s*"campaign-state-comparison-v1"/);
  assert.match(source, /rendererId:\s*"campaign_state_comparison"/);
  assert.match(source, /dndReferenceScope:\s*"audience_reference_only"/);
  assert.match(source, /srdMaterialUsed:\s*false/);
  assert.doesNotMatch(source, /Forgotten Realms|Ravenloft|Waterdeep|Strahd|Vecna|Beholder|Mind Flayer/i);
});

test("canonical visible concept copy stays within the 850 to 950 word decision-page budget", async () => {
  const modulePath = join(root, "tests", `.ai-game-master-copy-${process.pid}-${Date.now()}.mjs`);
  const fixtureSource = readFileSync(fixturePath, "utf8").replace(/^import type .*;\r?\n/gm, "");
  await writeFile(modulePath, ts.transpileModule(fixtureSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText);

  try {
    const { aiGameMasterVsChatbotPreviewPage: page } = await import(
      `${pathToFileURL(modulePath).href}?visible-copy-budget`
    );
    const wordCount = (visiblePageText(page).match(/[A-Za-z0-9][A-Za-z0-9']*/g) ?? []).length;
    assert.ok(wordCount >= 850 && wordCount <= 950, `visible concept word count: ${wordCount}`);
  } finally {
    await rm(modulePath, { force: true });
  }
});

test("dossier records early-stage metrics, multi-platform readiness, and the IP boundary", () => {
  const dossier = JSON.parse(readFileSync(dossierPath, "utf8"));
  assert.equal(dossier.status, "approved");
  assert.equal(dossier.publicationEligible, true);
  assert.equal(dossier.positioning.primaryKeyword, "ai game master vs chatbot for tabletop campaign");
  assert.equal(dossier.measurement.stage, "early_search_visibility");
  assert.ok(dossier.measurement.primary.includes("Google Search impressions"));
  assert.ok(dossier.measurement.primary.includes("Google Search clicks"));
  assert.ok(dossier.measurement.notRequiredNow.includes("revenue attribution"));
  assert.match(dossier.measurement.gscBoundary, /LoreLens URLs only/i);
  assert.match(dossier.measurement.multiPlatformBoundary, /allowlisted[\s\S]+destination/i);
  assert.equal(dossier.ipBoundary.srdMaterialUsed, false);
  assert.match(dossier.ipBoundary.legalBoundary, /does not grant/i);
  assert.equal(dossier.releaseBoundary.revenueAttributionBlocksPublication, false);
  assert.equal(dossier.releaseBoundary.publicationEligible, true);
  assert.equal(dossier.reviewBinding.reportId, "seo-2026-08-26");
  assert.equal(dossier.reviewBinding.slug, slug);
  assert.equal(dossier.reviewBinding.decision, "approved");
  assert.match(dossier.reviewBinding.draftDigest, /^[a-f0-9]{64}$/);
});

test("older science-fiction concept is explicitly superseded rather than silently repurposed", () => {
  const old = JSON.parse(readFileSync(
    join(root, "data", "page-dossiers", "story-driven-ai-voice-roleplay-adventure.json"),
    "utf8",
  ));
  assert.equal(old.status, "superseded_concept");
  assert.equal(old.supersededBy, slug);
  assert.equal(old.publicationEligible, false);
});

test("concept renderer constrains the title and intrinsic CTA width at the mobile gate", () => {
  const rendererStyles = readFileSync(rendererStylesPath, "utf8");
  const shellStyles = readFileSync(shellStylesPath, "utf8");

  assert.match(rendererStyles, /font-size:\s*clamp\(3\.4rem,\s*5\.4vw,\s*6\.6rem\)/);
  assert.match(rendererStyles, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(rendererStyles, /font-size:\s*clamp\(2\.45rem,\s*10\.5vw,\s*3\.4rem\)/);
  assert.match(rendererStyles, /\.disabledCta,[\s\S]*?\.heroCta\s*\{[\s\S]*?white-space:\s*normal/);
  assert.match(shellStyles, /\.nav\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*\.8fr\)\s*minmax\(0,\s*1\.2fr\)/);
  assert.match(shellStyles, /\.nav\s*>\s*\*\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
});
