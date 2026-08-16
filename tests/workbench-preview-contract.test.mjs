import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewSource = await readFile(
  new URL("../app/workbench/preview/[slug]/page.tsx", import.meta.url),
  "utf8",
);
const workbenchCss = await readFile(
  new URL("../app/workbench/workbench.css", import.meta.url),
  "utf8",
);

test("the workbench draft preview uses the production structured renderer contract", () => {
  assert.match(previewSource, /import \{ StructuredContentPage \} from "@\/app\/\[slug\]\/StructuredContentPage"/);
  assert.match(previewSource, /resolvePagePresentation\(previewPage\)/);
  assert.match(previewSource, /resolveRelatedSeoPages\(previewPage, await listPublishedPages\(\)\)/);
  assert.match(
    previewSource,
    /<StructuredContentPage[\s\S]*page=\{previewPage\}[\s\S]*recipe=\{presentation\}[\s\S]*relatedPages=\{relatedPages\}[\s\S]*mode="preview"[\s\S]*\/>/,
  );
  assert.match(previewSource, /<StoryCompanion sourceSlug=\{previewPage\.slug\} \/>/);
  assert.doesNotMatch(previewSource, /MessageResponse|wb-preview-(?:shell|page|hero|h1|lede|cta|content|section|h2|links|faq|audit)/);
});

test("the preview keeps only a fixed overlay toolbar from the workbench visual system", () => {
  const previewClasses = new Set(
    [...workbenchCss.matchAll(/\.((?:wb-preview)[a-z0-9-]*)/g)].map((match) => match[1]),
  );
  assert.deepEqual([...previewClasses], ["wb-preview-toolbar"]);
  assert.match(workbenchCss, /\.wb-preview-toolbar\s*\{[^}]*position:\s*fixed;/s);
  assert.doesNotMatch(workbenchCss, /\.wb-preview-toolbar\s*\{[^}]*position:\s*sticky;/s);
});
