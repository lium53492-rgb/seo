import assert from "node:assert/strict";
import test from "node:test";

import {
  hasExplicitMarkdownList,
  listMarkdownRenderBlocks,
  markdownSemanticBlockCount,
  parseMarkdownBlocks,
  unsupportedMarkdownReason,
} from "../lib/seo/markdown-semantics.mjs";

test("single-newline numbered items preserve surrounding prose", () => {
  const value = [
    "Use this short introduction before the decision steps.",
    "1. Compare the context supplied by each route.",
    "2) Choose the perspective that fits the next action.",
    "Keep this conclusion after the numbered list.",
  ].join("\n");

  assert.deepEqual(parseMarkdownBlocks(value), [
    { type: "prose", text: "Use this short introduction before the decision steps." },
    {
      type: "list",
      ordered: true,
      items: [
        "Compare the context supplied by each route.",
        "Choose the perspective that fits the next action.",
      ],
    },
    { type: "prose", text: "Keep this conclusion after the numbered list." },
  ]);
  assert.equal(markdownSemanticBlockCount(value), 4);
});

test("list-shaped render blocks keep prose and apply the section list order", () => {
  const value = [
    "Check the evidence before choosing.",
    "1. Confirm the supplied context.",
    "2. Confirm the available perspective.",
    "Stop if either condition is unclear.",
  ].join("\n");

  assert.deepEqual(listMarkdownRenderBlocks(value, false), [
    { type: "prose", text: "Check the evidence before choosing." },
    {
      type: "list",
      ordered: false,
      items: ["Confirm the supplied context.", "Confirm the available perspective."],
    },
    { type: "prose", text: "Stop if either condition is unclear." },
  ]);
});

test("unmarked paragraphs are never disguised as list items", () => {
  const value = "Inspect the opening pressure first.\n\nChoose the perspective second.";
  assert.deepEqual(listMarkdownRenderBlocks(value, true), [
    { type: "prose", text: "Inspect the opening pressure first." },
    { type: "prose", text: "Choose the perspective second." },
  ]);
  assert.equal(hasExplicitMarkdownList(value), false);
  assert.equal(markdownSemanticBlockCount(value), 2);
});

test("comparison parsing retains bullet semantics and wrapped item text", () => {
  const value = "Compare the routes.\n- Supplied context starts the scene.\n  Keep this detail with the first item.\n- Blank context leaves premise work open.\nRecord the difference.";
  assert.deepEqual(parseMarkdownBlocks(value), [
    { type: "prose", text: "Compare the routes." },
    {
      type: "list",
      ordered: false,
      items: [
        "Supplied context starts the scene. Keep this detail with the first item.",
        "Blank context leaves premise work open.",
      ],
    },
    { type: "prose", text: "Record the difference." },
  ]);
});

test("supported Markdown rejects syntax the production renderer cannot render", () => {
  assert.equal(unsupportedMarkdownReason("Use **one supported emphasis** here."), null);
  assert.equal(unsupportedMarkdownReason("Use *italics* here."), "unsupported-emphasis");
  assert.equal(unsupportedMarkdownReason("Use _italics_ here."), "unsupported-emphasis");
  assert.equal(unsupportedMarkdownReason("Read [this](https://example.com)."), "inline-link");
  assert.equal(unsupportedMarkdownReason("Run `code` here."), "code");
  assert.equal(unsupportedMarkdownReason("<strong>raw HTML</strong>"), "raw-html");
  assert.equal(unsupportedMarkdownReason("# Hidden heading"), "heading");
  assert.equal(unsupportedMarkdownReason("**Unclosed emphasis"), "unsupported-emphasis");
  assert.equal(unsupportedMarkdownReason("Plain **label**", { plainText: true }), "formatting-in-plain-text");
});
