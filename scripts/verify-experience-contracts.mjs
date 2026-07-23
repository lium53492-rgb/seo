import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

async function filesBelow(relativeDirectory, extension) {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesBelow(relativePath, extension));
    } else if (!extension || entry.name.endsWith(extension)) {
      files.push(relativePath);
    }
  }
  return files;
}

function keyframeBlocks(source) {
  const blocks = [];
  const keyframePattern = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{/g;
  let match;
  while ((match = keyframePattern.exec(source))) {
    let depth = 1;
    let cursor = keyframePattern.lastIndex;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    blocks.push({ name: match[1], body: source.slice(keyframePattern.lastIndex, cursor - 1) });
    keyframePattern.lastIndex = cursor;
  }
  return blocks;
}

const requiredFiles = [
  "public/cursors/story-hand.svg",
  "public/cursors/story-hand-action.svg",
  "app/[slug]/StoryCompanion.tsx",
  "app/[slug]/story-companion.module.css",
  "app/[slug]/story-motion-gallery.module.css",
];

for (const relativePath of requiredFiles) {
  try {
    await stat(path.join(root, relativePath));
  } catch {
    fail(`Missing required experience file: ${relativePath}`);
  }
}

const cssFiles = await filesBelow("app", ".css");
for (const relativePath of cssFiles) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  if (/transition\s*:\s*all\b/i.test(source)) {
    fail(`${relativePath} uses transition: all; list compositor-safe properties explicitly.`);
  }
  if (source.includes("@keyframes") && !source.includes("prefers-reduced-motion")) {
    fail(`${relativePath} defines animation without a reduced-motion fallback.`);
  }
  for (const keyframe of keyframeBlocks(source)) {
    if (/\b(?:backdrop-)?filter\s*:/i.test(keyframe.body)) {
      fail(`${relativePath} animates filter in @keyframes ${keyframe.name}; use transform/opacity.`);
    }
  }
}

const companionCss = await readFile(path.join(root, "app/[slug]/story-companion.module.css"), "utf8");
if (!/\.meteorField\s*\{[^}]*z-index:\s*2;[^}]*pointer-events:\s*none;/s.test(companionCss)) {
  fail("Meteor field must stay non-interactive and below the content/companion layers.");
}
if (!companionCss.includes('cursor: url("/cursors/story-hand.svg")')) {
  fail("Native story-hand cursor contract is missing.");
}
if (!companionCss.includes('cursor: url("/cursors/story-hand-action.svg")')) {
  fail("Native action cursor contract is missing.");
}

const companionSource = await readFile(path.join(root, "app/[slug]/StoryCompanion.tsx"), "utf8");
const pointerMoveBody = companionSource.match(/const handlePointerMove = \(event: PointerEvent\) => \{([\s\S]*?)\n    \};/)?.[1] ?? "";
if (!pointerMoveBody) {
  fail("Story companion pointer handler is missing.");
} else if (/closest\(|textContent|querySelector/.test(pointerMoveBody)) {
  fail("High-frequency pointermove handler must not traverse or read the DOM.");
}

const tsxFiles = [
  ...await filesBelow("app", ".tsx"),
  ...await filesBelow("components", ".tsx"),
];
for (const relativePath of tsxFiles) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const match of source.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gs)) {
    if (!/rel="[^"]*(?:noopener|noreferrer)[^"]*"/.test(match[0])) {
      fail(`${relativePath} opens a new tab without rel=noopener/noreferrer.`);
    }
  }
}

const imageFiles = [
  ...await filesBelow("public/characters"),
  ...await filesBelow("public/story-scenes"),
];
for (const relativePath of imageFiles) {
  const metadata = await stat(path.join(root, relativePath));
  if (metadata.size > 200 * 1024) {
    fail(`${relativePath} exceeds the 200 KiB experience-image budget.`);
  }
}

if (failures.length) {
  console.error("Experience contract verification failed:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Experience contracts verified across ${cssFiles.length} CSS files and ${tsxFiles.length} TSX files.`);
