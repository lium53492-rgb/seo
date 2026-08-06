const LIST_ITEM_PATTERN = /^\s*(?:(\d+)[.)]|([-*+]))\s+(.+?)\s*$/;

/**
 * Parse the small Markdown subset supported by structured SEO sections.
 * Prose paragraphs and marked lists remain in source order so validation and
 * rendering reason about exactly the same semantic blocks.
 */
export function parseMarkdownBlocks(value) {
  const blocks = [];
  let proseLines = [];
  let activeList = null;

  const flushProse = () => {
    const text = proseLines.join("\n").trim();
    if (text) blocks.push({ type: "prose", text });
    proseLines = [];
  };
  const flushList = () => {
    if (activeList?.items.length) blocks.push(activeList);
    activeList = null;
  };

  for (const rawLine of String(value || "").replaceAll("\r\n", "\n").split("\n")) {
    const listItem = rawLine.match(LIST_ITEM_PATTERN);
    if (listItem) {
      flushProse();
      const ordered = Boolean(listItem[1]);
      if (activeList && activeList.ordered !== ordered) flushList();
      activeList ??= { type: "list", ordered, items: [] };
      activeList.items.push(listItem[3].trim());
      continue;
    }

    if (!rawLine.trim()) {
      flushProse();
      continue;
    }

    if (activeList && /^\s+/.test(rawLine)) {
      const lastIndex = activeList.items.length - 1;
      activeList.items[lastIndex] = `${activeList.items[lastIndex]} ${rawLine.trim()}`;
      continue;
    }

    flushList();
    proseLines.push(rawLine.trim());
  }

  flushProse();
  flushList();
  return blocks;
}

export function markdownSemanticBlockCount(value) {
  return parseMarkdownBlocks(value).reduce((count, block) =>
    count + (block.type === "list" ? block.items.length : 1), 0);
}

/**
 * List-shaped section formats keep their visual list contract while prose
 * before or after an explicitly marked list remains prose. Historical drafts
 * with two or more blank-line paragraphs still become list items.
 */
export function listMarkdownRenderBlocks(value, ordered) {
  const blocks = parseMarkdownBlocks(value);
  if (!blocks.some((block) => block.type === "list")) {
    const items = blocks.map((block) => block.text);
    return items.length ? [{ type: "list", ordered, items }] : [];
  }
  return blocks.map((block) => block.type === "list"
    ? { ...block, ordered }
    : block);
}
