const LIST_ITEM_PATTERN = /^\s*(?:(\d+)[.)]|([-*+]))\s+(.+?)\s*$/;
const RAW_HTML_PATTERN = /<\/?[A-Za-z][^>]*>/;
const LINK_PATTERN = /!?\[[^\]]*\]\([^)]*\)/;
const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+/m;
const BLOCKQUOTE_PATTERN = /^\s{0,3}>\s?/m;
const CODE_PATTERN = /`|^\s{0,3}~~~+/m;

/**
 * Return a stable error code when copy contains Markdown the production
 * renderer does not support. The rendered contract intentionally stays
 * small: paragraphs, marked lists, and paired **strong** spans only.
 */
export function unsupportedMarkdownReason(value, { plainText = false } = {}) {
  const source = String(value || "");
  if (RAW_HTML_PATTERN.test(source)) return "raw-html";
  if (LINK_PATTERN.test(source)) return "inline-link";
  if (HEADING_PATTERN.test(source)) return "heading";
  if (BLOCKQUOTE_PATTERN.test(source)) return "blockquote";
  if (CODE_PATTERN.test(source)) return "code";

  const withoutStrong = source.replace(/\*\*[^*\n]+\*\*/g, "");
  if (/\*|_/.test(withoutStrong)) return "unsupported-emphasis";
  if (plainText && /\*\*/.test(source)) return "formatting-in-plain-text";
  return null;
}

export function hasExplicitMarkdownList(value) {
  return parseMarkdownBlocks(value).some((block) => block.type === "list");
}

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
 * before or after an explicitly marked list remains prose. Unmarked prose is
 * never silently relabelled as list items: authors must express the intended
 * structure in the reviewed source.
 */
export function listMarkdownRenderBlocks(value, ordered) {
  const blocks = parseMarkdownBlocks(value);
  return blocks.map((block) => block.type === "list"
    ? { ...block, ordered }
    : block);
}
