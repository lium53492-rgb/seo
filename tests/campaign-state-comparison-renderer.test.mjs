import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as ts from "typescript";
import { validateRendererSpecificContent } from "../lib/seo/content-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const componentPath = join(
  root,
  "components",
  "seo",
  "ai-game-master-vs-chatbot",
  "CampaignStateComparisonPage.tsx",
);
const fixturePath = join(
  root,
  "components",
  "seo",
  "ai-game-master-vs-chatbot",
  "preview-page.ts",
);
const cssPath = join(
  root,
  "components",
  "seo",
  "ai-game-master-vs-chatbot",
  "campaign-state-comparison.module.css",
);
const recipePath = join(root, "data", "config", "presentation-recipes.json");
const structuredRendererPath = join(root, "app", "[slug]", "StructuredContentPage.tsx");

test("campaign-state renderer is registered one-to-one with its decision recipe", () => {
  const recipes = JSON.parse(readFileSync(recipePath, "utf8"));
  const recipe = recipes.recipes.find((entry) => entry.id === "campaign-state-comparison-v1");
  const types = readFileSync(join(root, "lib", "seo", "types.ts"), "utf8");
  const presentation = readFileSync(join(root, "lib", "seo", "page-presentation.ts"), "utf8");
  const contract = readFileSync(join(root, "lib", "seo", "content-contract.mjs"), "utf8");
  const experienceVerifier = readFileSync(join(root, "scripts", "verify-experience-contracts.mjs"), "utf8");

  assert.equal(recipe.rendererId, "campaign_state_comparison");
  assert.deepEqual(recipe.compatiblePagePatterns, ["decision_page"]);
  assert.deepEqual(recipe.compatibleArchetypes, ["comparison"]);
  assert.equal(recipe.layoutId, "split-turn-trace");
  assert.equal(recipe.paletteId, "lampblack-ember");
  assert.equal(recipe.reusePolicy.kind, "single_use");
  assert.ok(recipe.domainConcepts.length >= 5);
  assert.match(types, /\| "campaign_state_comparison"/);
  assert.match(presentation, /"campaign_state_comparison"/);
  assert.match(contract, /"campaign_state_comparison"/);
  assert.match(experienceVerifier, /campaign-state-comparison\.module\.css/);
});

test("renderer-specific contract rejects a campaign loop with missing or reordered lanes", async () => {
  const fixtureModulePath = join(root, "tests", `.campaign-loop-fixture-${process.pid}-${Date.now()}.mjs`);
  const fixtureSource = readFileSync(fixturePath, "utf8").replace(/^import type .*;\r?\n/gm, "");
  const compilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  };
  await writeFile(
    fixtureModulePath,
    ts.transpileModule(fixtureSource, { compilerOptions }).outputText,
  );

  try {
    const { aiGameMasterVsChatbotPreviewPage: page } = await import(
      `${pathToFileURL(fixtureModulePath).href}?campaign-loop-contract`
    );
    assert.equal(validateRendererSpecificContent({
      architecture: page.architecture,
      signatureModule: page.signatureModule,
    }), true);

    const reordered = structuredClone(page.signatureModule);
    reordered.items[0].bodyMarkdown = reordered.items[0].bodyMarkdown
      .replace("**General chatbot:**", "**Campaign narrator:**");
    assert.throws(
      () => validateRendererSpecificContent({
        architecture: page.architecture,
        signatureModule: reordered,
      }),
      /General chatbot and AI game master in order/,
    );

    const missing = structuredClone(page.signatureModule);
    missing.items.pop();
    assert.throws(
      () => validateRendererSpecificContent({
        architecture: page.architecture,
        signatureModule: missing,
      }),
      /exactly four loop checkpoints/,
    );
  } finally {
    await rm(fixtureModulePath, { force: true });
  }
});

test("custom renderer emits crawlable sections, four comparison checkpoints, FAQs, and CTA", async () => {
  const rendererModulePath = join(root, "tests", `.campaign-state-renderer-${process.pid}-${Date.now()}.mjs`);
  const fixtureModulePath = join(root, "tests", `.campaign-state-page-${process.pid}-${Date.now()}.mjs`);
  const rendererSource = readFileSync(componentPath, "utf8")
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
      'import styles from "./campaign-state-comparison.module.css";',
      'const styles = new Proxy({}, { get: (_target, key) => String(key) });',
    );
  const fixtureSource = readFileSync(fixturePath, "utf8").replace(/^import type .*;\r?\n/gm, "");
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
    const [{ CampaignStateComparisonPage }, { aiGameMasterVsChatbotPreviewPage: page }] = await Promise.all([
      import(`${pathToFileURL(rendererModulePath).href}?campaign-state-renderer`),
      import(`${pathToFileURL(fixtureModulePath).href}?campaign-state-renderer`),
    ]);
    const html = renderToStaticMarkup(createElement(CampaignStateComparisonPage, {
      page,
      relatedPages: [],
      mode: "public",
    }));
    const normalizedHtml = html.replaceAll("&amp;", "&");

    assert.match(html, /data-presentation-recipe="campaign-state-comparison-v1"/);
    assert.match(html, /data-renderer="campaign_state_comparison"/);
    assert.match(html, /data-signature-module="campaign-loop-test"/);
    assert.equal((html.match(/class="traceStage"/g) ?? []).length, 4);
    assert.equal((html.match(/data-content-role=/g) ?? []).length, page.sections.length);
    assert.equal((html.match(/data-faq-job=/g) ?? []).length, page.faqs.length);
    for (const section of page.sections) {
      assert.ok(html.includes(`id="${section.id}"`), `missing standalone section ${section.id}`);
      assert.ok(normalizedHtml.includes(section.heading), `missing heading ${section.heading}`);
    }
    assert.match(
      html,
      /href="\/go\/playworlds\/ai-game-master-vs-chatbot-for-tabletop-campaign\?location=final_cta"/,
    );
    assert.doesNotMatch(html, /NovelAI|\/go\/novelai\//i);
  } finally {
    await Promise.all([
      rm(rendererModulePath, { force: true }),
      rm(fixtureModulePath, { force: true }),
    ]);
  }
});

test("StructuredContentPage dispatches the campaign renderer inside its main shell and follows it with the IP notice", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const rendererModulePath = join(root, "tests", `.campaign-state-integrated-renderer-${nonce}.mjs`);
  const fixtureModulePath = join(root, "tests", `.campaign-state-integrated-page-${nonce}.mjs`);
  const structuredModulePath = join(root, "tests", `.campaign-state-structured-renderer-${nonce}.mjs`);
  const rendererSource = readFileSync(componentPath, "utf8")
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
      'import styles from "./campaign-state-comparison.module.css";',
      'const styles = new Proxy({}, { get: (_target, key) => String(key) });',
    );
  const fixtureSource = readFileSync(fixturePath, "utf8").replace(/^import type .*;\r?\n/gm, "");
  const structuredSource = readFileSync(structuredRendererPath, "utf8")
    .replace(
      'import { TrackedPlayworldsLink } from "@/app/components/TrackedPlayworldsLink";',
      'const TrackedPlayworldsLink = ({ children, sourceSlug, location, ...props }) => <a {...props} href={`/go/playworlds/${sourceSlug}?location=${location}`}>{children}</a>;',
    )
    .replace(
      'import { DndOriginalOnlyNotice } from "@/components/seo/DndOriginalOnlyNotice";',
      'const DndOriginalOnlyNotice = ({ ipBoundary }) => ipBoundary?.srdMaterialUsed === false ? <aside data-ip-boundary="original-tabletop-fantasy" data-srd-material-used="false">Independent original tabletop fantasy.</aside> : null;',
    )
    .replace(
      'import { CampaignStateComparisonPage } from "@/components/seo/ai-game-master-vs-chatbot/CampaignStateComparisonPage";',
      `import { CampaignStateComparisonPage } from "./.campaign-state-integrated-renderer-${nonce}.mjs";`,
    )
    .replace(
      'import { StoryDrivenAdventurePage } from "@/components/seo/story-driven-adventure/StoryDrivenAdventurePage";',
      'const StoryDrivenAdventurePage = () => <div data-story-renderer="unexpected" />;',
    )
    .replace(
      'import { listMarkdownRenderBlocks, parseMarkdownBlocks } from "@/lib/seo/markdown-semantics.mjs";',
      'import { listMarkdownRenderBlocks, parseMarkdownBlocks } from "../lib/seo/markdown-semantics.mjs";',
    )
    .replace(/^import type .*;\r?\n/gm, "")
    .replace(
      'import styles from "./structured-content.module.css";',
      'const styles = new Proxy({}, { get: (_target, key) => String(key) });',
    );
  const compilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  };

  await Promise.all([
    writeFile(rendererModulePath, ts.transpileModule(rendererSource, { compilerOptions }).outputText),
    writeFile(fixtureModulePath, ts.transpileModule(fixtureSource, { compilerOptions }).outputText),
    writeFile(structuredModulePath, ts.transpileModule(structuredSource, { compilerOptions }).outputText),
  ]);

  try {
    const [{ StructuredContentPage }, { aiGameMasterVsChatbotPreviewPage: page }] = await Promise.all([
      import(`${pathToFileURL(structuredModulePath).href}?campaign-state-integration`),
      import(`${pathToFileURL(fixtureModulePath).href}?campaign-state-integration`),
    ]);
    const recipes = JSON.parse(readFileSync(recipePath, "utf8"));
    const recipe = recipes.recipes.find((entry) => entry.id === "campaign-state-comparison-v1");
    const html = renderToStaticMarkup(createElement(StructuredContentPage, {
      page,
      recipe,
      relatedPages: [],
      mode: "preview",
    }));

    assert.match(html, /^<main class="shell" id="top"/);
    assert.equal((html.match(/data-renderer="campaign_state_comparison"/g) ?? []).length, 2);
    assert.match(html, /data-signature-module="campaign-loop-test"/);
    assert.match(html, /<\/main><aside data-ip-boundary="original-tabletop-fantasy" data-srd-material-used="false">/);
    assert.doesNotMatch(html, /data-story-renderer="unexpected"/);
  } finally {
    await Promise.all([
      rm(rendererModulePath, { force: true }),
      rm(fixtureModulePath, { force: true }),
      rm(structuredModulePath, { force: true }),
    ]);
  }
});

test("campaign-state CSS commits to one adult dark-tabletop visual system", () => {
  const css = readFileSync(cssPath, "utf8");
  for (const token of [
    "--lampblack",
    "--soot",
    "--iron",
    "--ash",
    "--bone",
    "--ember",
    "--campaign-display",
    "--campaign-ledger",
  ]) assert.match(css, new RegExp(token));
  assert.match(css, /\.traceStages/);
  assert.match(css, /\.laneComparison/);
  assert.match(css, /\.sectionUnit:nth-child\(even\) \.passage/);
  assert.doesNotMatch(css, /\.passage:nth-child\(even\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.doesNotMatch(css, /purple|glassmorphism|border-radius:\s*(?:1[2-9]|[2-9]\d)px/i);
});
