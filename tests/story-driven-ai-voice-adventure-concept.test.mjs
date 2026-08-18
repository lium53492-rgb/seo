import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as ts from "typescript";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const slug = "story-driven-ai-voice-roleplay-adventure";
const routePath = join(projectRoot, "app", "workbench", "concepts", slug, "page.tsx");
const componentPath = join(
  projectRoot,
  "components",
  "seo",
  "story-driven-adventure",
  "StoryDrivenAdventurePage.tsx",
);
const previewPagePath = join(
  projectRoot,
  "components",
  "seo",
  "story-driven-adventure",
  "preview-page.ts",
);
const structuredRendererPath = join(projectRoot, "app", "[slug]", "StructuredContentPage.tsx");
const presentationRegistryPath = join(projectRoot, "lib", "seo", "page-presentation.ts");
const rendererContractPath = join(projectRoot, "lib", "seo", "content-contract.mjs");
const typesPath = join(projectRoot, "lib", "seo", "types.ts");
const recipePath = join(projectRoot, "data", "config", "presentation-recipes.json");
const dossierPath = join(projectRoot, "data", "page-dossiers", `${slug}.json`);
const dossierTemplatePath = join(projectRoot, "docs", "seo", "page-launch-dossier-template.md");
const assetPath = join(projectRoot, "public", "images", "story-driven-ai-voice-adventure.webp");
const publicPagePath = join(projectRoot, "data", "pages", `${slug}.json`);
const oldSlug = "dnd-character-voice-without-an-accent";
const retiredBrandPattern = new RegExp(["Novel", "AI"].join(""), "i");
const retiredRoutePattern = new RegExp(["/go/", "novel", "ai"].join(""), "i");

test("science-fiction adventure preview is protected and stays outside the publisher store", () => {
  const route = readFileSync(routePath, "utf8");

  assert.match(route, /isBasicAuthHeaderAuthorized/);
  assert.match(route, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  assert.match(route, /storyDrivenAdventurePreviewPage/);
  assert.match(route, /resolvePagePresentation\(storyDrivenAdventurePreviewPage\)/);
  assert.match(route, /<StructuredContentPage[\s\S]*mode="preview"/);
  assert.equal(existsSync(publicPagePath), false);
  assert.equal(
    existsSync(join(projectRoot, "app", "workbench", "concepts", oldSlug, "page.tsx")),
    false,
  );
  assert.equal(existsSync(join(projectRoot, "data", "page-dossiers", `${oldSlug}.json`)), false);
});

test("the specialized renderer consumes schema-3 content instead of owning page copy", () => {
  const component = readFileSync(componentPath, "utf8");
  const previewPage = readFileSync(previewPagePath, "utf8");

  for (const contract of [
    /page\.h1/,
    /page\.heroMarkdown/,
    /page\.sections/,
    /page\.faqs\.map/,
    /page\.primaryCta/,
    /signatureModule\.items\.map/,
    /architecture\.presentation\.surfaceCopy/,
  ]) assert.match(component, contract);

  assert.match(component, /TrackedPlayworldsLink/);
  assert.doesNotMatch(component, /TrackedNovelAiHomeLink/);
  assert.doesNotMatch(component, /Ilexa Vant|Moro Qel|Calyx Orra/);
  assert.doesNotMatch(component, /Choose a role in a voice-first AI adventure/);

  assert.match(previewPage, /satisfies PublishedSeoPage/);
  assert.match(previewPage, /schemaVersion:\s*3/);
  assert.match(previewPage, /painPointId:\s*"character_hook_gap"/);
  assert.doesNotMatch(previewPage, /painPointId:\s*"product_fit_uncertainty"/);
  assert.match(previewPage, /Choose a role in a voice-first AI adventure for D&D players\./i);
  assert.match(previewPage, /A signal from Mars is waiting\./i);
  assert.match(previewPage, /What makes a sci-fi campaign scenario playable for D&D players\?/i);
  assert.match(previewPage, /How do D&D players choose a role for an AI adventure\?/i);
  assert.match(previewPage, /Three original science-fantasy campaign scenarios/i);
  assert.match(previewPage, /online, single-player, voice-first AI adventure RPG/i);
  assert.match(previewPage, /Campaigns can be created, saved, and resumed/i);
  assert.match(previewPage, /Wishlist Playworlds on Steam/i);
  assert.match(previewPage, /Ilexa Vant|Moro Qel|Calyx Orra/);
  assert.doesNotMatch(previewPage, /blank chat|empty AI roleplay start/i);
  assert.doesNotMatch(previewPage, /choose an available role|available story character|existing story plot/i);
  assert.doesNotMatch(previewPage, /Marvel|Superman|Star Wars/i);
});

test("the specialized renderer emits real HTML for every build-verifier contract", async () => {
  const rendererModulePath = join(
    projectRoot,
    "tests",
    `.story-driven-renderer-${process.pid}-${Date.now()}.mjs`,
  );
  const fixtureModulePath = join(
    projectRoot,
    "tests",
    `.story-driven-fixture-${process.pid}-${Date.now()}.mjs`,
  );
  const rendererSource = readFileSync(componentPath, "utf8")
    .replace(
      'import Image from "next/image";',
      'const Image = ({ fill: _fill, priority: _priority, ...props }) => <img {...props} />;',
    )
    .replace(
      'import { TrackedPlayworldsLink } from "@/app/components/TrackedPlayworldsLink";',
      'const TrackedPlayworldsLink = ({ children, sourceSlug, location, ...props }) => <a {...props} href={`/go/playworlds/${sourceSlug}?location=${location}`}>{children}</a>;',
    )
    .replace(
      'import { parseMarkdownBlocks } from "@/lib/seo/markdown-semantics.mjs";',
      'import { parseMarkdownBlocks } from "../lib/seo/markdown-semantics.mjs";',
    )
    .replace(/^import type .*;\r?\n/gm, "")
    .replace(
      'import styles from "./story-driven-adventure.module.css";',
      'const styles = new Proxy({}, { get: (_target, key) => String(key) });',
    );
  const fixtureSource = readFileSync(previewPagePath, "utf8")
    .replace(/^import type .*;\r?\n/gm, "");
  const compilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  };

  await Promise.all([
    writeFile(rendererModulePath, ts.transpileModule(rendererSource, { compilerOptions }).outputText),
    writeFile(fixtureModulePath, ts.transpileModule(fixtureSource, { compilerOptions }).outputText),
  ]);

  try {
    const [{ StoryDrivenAdventurePage }, { storyDrivenAdventurePreviewPage }] = await Promise.all([
      import(`${pathToFileURL(rendererModulePath).href}?renderer-contract`),
      import(`${pathToFileURL(fixtureModulePath).href}?renderer-contract`),
    ]);
    assert.equal(storyDrivenAdventurePreviewPage.quality.passed, false);
    assert.equal(storyDrivenAdventurePreviewPage.quality.wordCount, 0);
    assert.equal(storyDrivenAdventurePreviewPage.editorialReview, undefined);
    assert.equal(storyDrivenAdventurePreviewPage.servedContentDigest, undefined);
    const html = renderToStaticMarkup(createElement(StoryDrivenAdventurePage, {
      page: storyDrivenAdventurePreviewPage,
      relatedPages: [],
      mode: "public",
    }));

    assert.match(html, /data-presentation-recipe="story-driven-adventure-v1"/);
    assert.match(html, /data-renderer="story_driven_adventure"/);
    assert.ok(
      html.includes(`data-signature-module="${storyDrivenAdventurePreviewPage.signatureModule.id}"`),
    );
    assert.ok(
      html.includes(`data-signature-type="${storyDrivenAdventurePreviewPage.signatureModule.type}"`),
    );
    for (const section of storyDrivenAdventurePreviewPage.sections) {
      assert.ok(
        html.includes(`data-content-role="${section.role}"`),
        `missing rendered content role ${section.role}`,
      );
      assert.ok(
        html.includes(`data-content-format="${section.format}"`),
        `missing rendered content format ${section.format}`,
      );
    }
    const renderedRoles = [...html.matchAll(/data-content-role="([^"]+)"/g)]
      .map((match) => match[1]);
    assert.deepEqual(renderedRoles.toSorted(), [
      "direct_answer",
      "failure_analysis",
      "framework",
      "next_step",
      "worked_example",
    ].toSorted(), "the specialized renderer must emit each required publisher role exactly once");
    const renderedIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(renderedIds).size, renderedIds.length, "rendered HTML must not contain duplicate IDs");
    assert.match(html, /href="\/go\/playworlds\/story-driven-ai-voice-roleplay-adventure\?location=final_cta"/);
    assert.doesNotMatch(html, retiredBrandPattern);
    assert.doesNotMatch(html, retiredRoutePattern);
  } finally {
    await Promise.all([
      rm(rendererModulePath, { force: true }),
      rm(fixtureModulePath, { force: true }),
    ]);
  }
});

test("the story-driven renderer is registered one-to-one with its recipe and type", () => {
  const recipes = JSON.parse(readFileSync(recipePath, "utf8"));
  const recipe = recipes.recipes.find((entry) => entry.id === "story-driven-adventure-v1");
  const structuredRenderer = readFileSync(structuredRendererPath, "utf8");
  const presentationRegistry = readFileSync(presentationRegistryPath, "utf8");
  const rendererContract = readFileSync(rendererContractPath, "utf8");
  const types = readFileSync(typesPath, "utf8");

  assert.equal(recipe.rendererId, "story_driven_adventure");
  assert.equal(recipe.visualSystemId, "story-driven-adventure");
  assert.equal(recipe.reusePolicy.kind, "single_use");
  assert.ok(recipe.domainConcepts.length >= 5);
  assert.match(structuredRenderer, /case "story_driven_adventure"/);
  assert.match(structuredRenderer, /<StoryDrivenAdventurePage page=\{page\}/);
  assert.match(presentationRegistry, /"story_driven_adventure"/);
  assert.match(rendererContract, /"story_driven_adventure"/);
  assert.match(types, /\| "story_driven_adventure"/);
});

test("dossier records the Playworlds Steam facts and keeps release blockers explicit", () => {
  const dossierSource = readFileSync(dossierPath, "utf8");
  const dossier = JSON.parse(dossierSource);

  assert.equal(dossier.status, "draft_for_release");
  assert.equal(dossier.publicationEligible, false);
  assert.equal(dossier.positioning.primaryKeyword, "ai roleplay adventure");
  assert.equal(dossier.research.collectedOn, "2026-08-16");
  assert.equal(dossier.googleTrends.collectionState, "observed");
  assert.equal(dossier.googleTrends.exactRisingMatch, false);
  assert.equal(dossier.googleTrends.notObservedAllowsPublication, true);
  assert.match(dossier.googleTrends.snapshotDigest, /^[a-f0-9]{64}$/);
  assert.ok(dossier.googleTrends.candidates.every((candidate) => candidate.state === "not_observed"));
  assert.match(dossier.googleTrends.interpretation, /never proof of zero demand/);
  assert.match(dossier.googleTrends.interpretation, /does not block publication by itself/);
  assert.equal(dossier.releaseInfrastructure.canonicalOrigin, "https://lorelens.playworlds.ai");
  assert.equal(dossier.releaseInfrastructure.production.state, "verified");
  assert.equal(dossier.releaseInfrastructure.searchConsole.property, "https://lorelens.playworlds.ai/");
  assert.equal(dossier.releaseInfrastructure.searchConsole.permission, "Full");
  assert.equal(dossier.releaseInfrastructure.searchConsole.state, "observed");
  assert.equal(
    dossier.releaseInfrastructure.attributedOutbound.conceptSlugState,
    "404_until_published",
  );
  assert.equal(dossier.releaseInfrastructure.playworldsConversionCallback.state, "unavailable");
  assert.equal(dossier.schemaContract.preview.isPublishedPageArtifact, false);
  assert.equal(dossier.schemaContract.formalPublication.draftSchemaVersion, 2);
  assert.equal(dossier.schemaContract.formalPublication.publishedPageSchemaVersion, 3);
  assert.match(dossier.schemaContract.conceptReadinessNote, /character_hook_gap/);
  assert.match(dossier.schemaContract.conceptReadinessNote, /same-day research decision/);
  assert.match(dossier.schemaContract.conceptReadinessNote, /cannot be promoted directly/);
  assert.equal(dossier.currentReleaseBoundary.productionPolicyAllowsThisLane, false);
  assert.match(dossier.currentReleaseBoundary.reason, /production origin.*Search Console property are verified/);
  assert.match(dossier.currentReleaseBoundary.reason, /callback receiver contract is implemented and deployed/);
  assert.match(dossier.currentReleaseBoundary.reason, /lacks PLAYWORLDS_CALLBACK_SECRET/);
  assert.match(dossier.currentReleaseBoundary.reason, /no recent product-side signed handshake has been observed/);
  assert.match(dossier.currentReleaseBoundary.reason, /direct Steam CTA cannot return an exact purchase/);
  assert.match(dossier.currentReleaseBoundary.reason, /not_observed.*not a publication blocker/);
  assert.doesNotMatch(dossier.currentReleaseBoundary.reason, /lacks an exact US Top Rising match/);
  assert.match(dossier.currentReleaseBoundary.reason, /No current-day 8–12-candidate research report/);
  assert.match(
    dossier.releaseInfrastructure.playworldsConversionCallback.reason,
    /receiver contract is implemented and deployed/,
  );
  assert.match(
    dossier.releaseInfrastructure.playworldsConversionCallback.reason,
    /direct Steam CTA.*cannot return a purchase tied to an individual seo_click_id/,
  );
  assert.ok(
    dossier.currentReleaseBoundary.requiredBeforePublication.some((requirement) =>
      /accept an exact candidate as observed or not_observed/.test(requirement),
    ),
  );
  assert.doesNotMatch(dossier.currentReleaseBoundary.reason, /production domain.*not been verified/);
  assert.deepEqual(dossier.productTruth.factIdsUsed, [
    "playworlds-current-product",
    "dnd-content-direction",
    "dnd-primary-audience",
    "playworlds-voice-text-single-player-rpg",
    "playworlds-ai-game-master",
    "playworlds-in-world-companion",
    "playworlds-persistent-campaigns",
    "playworlds-rpg-state",
  ]);
  assert.equal(dossier.productTruth.source.appId, 4911480);
  assert.equal(
    dossier.productTruth.source.url,
    "https://store.steampowered.com/app/4911480/Playworlds/",
  );
  assert.equal(
    dossier.cta.destination,
    "https://store.steampowered.com/app/4911480/Playworlds/",
  );
  assert.equal(
    dossier.cta.routeForThisSlug,
    "/go/playworlds/story-driven-ai-voice-roleplay-adventure",
  );
  assert.equal(dossier.cta.state, "disabled_in_preview");
  assert.equal(dossier.cta.currentLiveRouteState, "404_until_schema3_publication");
  assert.deepEqual(dossier.conceptIpBoundary.thirdPartyNames, ["Dungeons & Dragons"]);
  assert.match(dossier.conceptIpBoundary.allowedReference, /adult tabletop-audience reference/i);
  assert.doesNotMatch(dossierSource, /voice-roleplay-format|existing-story|role-selection/);
});

test("the restored dossier template covers the current fail-closed launch contract", () => {
  const template = readFileSync(dossierTemplatePath, "utf8");

  for (const heading of [
    "Search intent and keyword source",
    "Google Trends and breakout evidence",
    "Competitor and source learning",
    "Section map and passage architecture",
    "Product truth",
    "IP, licensing, and audience boundary",
    "GEO and retrievable-answer plan",
    "CTA and conversion contract",
    "Measurement and revenue loop",
    "Editorial, visual, and schema-3 proof",
    "Release gate decision",
  ]) assert.match(template, new RegExp(`## ${heading}`));

  assert.match(template, /publicationEligible: false/);
  assert.match(template, /reviewBinding: null/);
  assert.match(template, /https:\/\/lorelens\.playworlds\.ai\//);
  assert.match(template, /\/go\/playworlds\/\{source-slug\}/);
  assert.match(template, /top_rising_terms/);
  assert.match(template, /signed Playworlds callback handshake/);
  assert.match(template, /servedContentDigest/);
  assert.doesNotMatch(template, retiredBrandPattern);
  assert.doesNotMatch(template, retiredRoutePattern);
});

test("all concept artifacts have retired the previous product destination", () => {
  const sources = [routePath, componentPath, previewPagePath, dossierPath].map((path) => ({
    path,
    source: readFileSync(path, "utf8"),
  }));

  for (const { path, source } of sources) {
    assert.doesNotMatch(source, retiredBrandPattern, `${path} still names the retired product`);
    assert.doesNotMatch(source, retiredRoutePattern, `${path} still contains the retired CTA route`);
  }

  assert.match(sources.map(({ source }) => source).join("\n"), /Playworlds/);
  assert.match(sources.map(({ source }) => source).join("\n"), /4911480/);
});

test("original ImageGen hero is present and substantial", () => {
  assert.equal(existsSync(assetPath), true);
  assert.ok(statSync(assetPath).size > 50_000);
});
