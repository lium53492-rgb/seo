export type MarkdownProseBlock = Readonly<{
  type: "prose";
  text: string;
}>;

export type MarkdownListBlock = Readonly<{
  type: "list";
  ordered: boolean;
  items: readonly string[];
}>;

export type MarkdownBlock = MarkdownProseBlock | MarkdownListBlock;

export function parseMarkdownBlocks(value: unknown): MarkdownBlock[];
export function markdownSemanticBlockCount(value: unknown): number;
export function listMarkdownRenderBlocks(value: unknown, ordered: boolean): MarkdownBlock[];
