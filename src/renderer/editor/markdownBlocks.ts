import type { Root, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

/** Parses Markdown into an mdast tree with GFM and source positions. */
export function parseMarkdown(markdown: string): Root {
  return fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

/** A top-level block of a Markdown document and its source range. */
export interface SourceBlock {
  readonly type: RootContent['type'];
  /** The block's exact source text. */
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** Splits Markdown into its top-level blocks, in document order. */
export function splitBlocks(markdown: string): SourceBlock[] {
  const blocks: SourceBlock[] = [];
  for (const node of parseMarkdown(markdown).children) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) continue;
    blocks.push({ type: node.type, text: markdown.slice(start, end), start, end });
  }
  return blocks;
}
