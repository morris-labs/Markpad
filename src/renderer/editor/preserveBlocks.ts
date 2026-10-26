import { splitBlocks, type SourceBlock } from './markdownBlocks';

/** Block types that the editor drops on load, so they're carried over as-is. */
const CARRIED_TYPES: ReadonlySet<string> = new Set(['definition']);

const BLOCK_SEPARATOR = '\n\n';

interface OriginalBlock extends SourceBlock {
  /** The block as the editor serializes it, or null for a carried block. */
  readonly canonical: string | null;
}

interface OutputBlock {
  readonly text: string;
  /** The index of the original block this text came from, or null. */
  readonly origin: number | null;
}

/**
 * Restores the original source text of unedited blocks.
 *
 * The editor re-serializes the whole document on every change, which rewrites
 * formatting in blocks that the user didn't touch. This class compares the
 * editor's output with the original file block by block and keeps the
 * original text of each block whose content is unchanged.
 */
export class BlockPreserver {
  private readonly blocks: readonly OriginalBlock[];
  private readonly source: string;

  /**
   * @param source The original Markdown, with LF line endings.
   * @param canonicalize A function that serializes Markdown the way the
   *     editor does.
   */
  constructor(source: string, canonicalize: (markdown: string) => string) {
    this.source = source;
    const blocks = splitBlocks(source);
    // Reference links in a block resolve only when their definitions are present.
    const definitions = blocks
      .filter((block) => CARRIED_TYPES.has(block.type))
      .map((block) => `\n\n${block.text}`)
      .join('');
    this.blocks = blocks.map((block) => ({
      ...block,
      canonical: CARRIED_TYPES.has(block.type)
        ? null
        : canonicalize(block.text + definitions).trim(),
    }));
  }

  /** Gets the editor's Markdown with unedited blocks restored to their source. */
  restore(edited: string): string {
    const editedBlocks = splitBlocks(edited);
    const matchable = this.blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.canonical !== null);
    const pairs = longestCommonSubsequence(
      editedBlocks.map((block) => block.text.trim()),
      matchable.map(({ block }) => block.canonical ?? ''),
    );

    const output: OutputBlock[] = editedBlocks.map((block, i) => {
      const match = pairs.get(i);
      if (match === undefined) return { text: block.text, origin: null };
      const original = matchable[match];
      return original
        ? { text: original.block.text, origin: original.index }
        : { text: block.text, origin: null };
    });
    this.insertCarriedBlocks(output);
    return this.join(output);
  }

  /** Puts each carried block after the output block that preceded it originally. */
  private insertCarriedBlocks(output: OutputBlock[]): void {
    this.blocks.forEach((block, index) => {
      if (block.canonical !== null) return;
      let at = 0;
      output.forEach((item, position) => {
        if (item.origin !== null && item.origin < index) at = position + 1;
      });
      output.splice(at, 0, { text: block.text, origin: index });
    });
  }

  private join(output: readonly OutputBlock[]): string {
    let result = '';
    output.forEach((item, i) => {
      const previous = output[i - 1];
      if (previous) {
        result += this.separator(previous, item);
      }
      result += item.text;
    });
    return result;
  }

  private separator(previous: OutputBlock, next: OutputBlock): string {
    if (previous.origin === null || next.origin === null || next.origin !== previous.origin + 1) {
      return BLOCK_SEPARATOR;
    }
    const before = this.blocks[previous.origin];
    const after = this.blocks[next.origin];
    return before && after ? this.source.slice(before.end, after.start) : BLOCK_SEPARATOR;
  }
}

/** Matches equal items of two sequences, and maps each index of `a` to one of `b`. */
function longestCommonSubsequence(a: readonly string[], b: readonly string[]): Map<number, number> {
  const pairs = new Map<number, number>();
  // A typical edit touches one block, so match the shared start and end
  // directly and run the quadratic table only on the middle.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    pairs.set(head, head);
    head++;
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    pairs.set(a.length - 1 - tail, b.length - 1 - tail);
    tail++;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const cols = midB.length + 1;
  const table = new Uint32Array((midA.length + 1) * cols);
  for (let i = midA.length - 1; i >= 0; i--) {
    for (let j = midB.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        midA[i] === midB[j]
          ? (table[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * cols + j] ?? 0, table[i * cols + j + 1] ?? 0);
    }
  }
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      pairs.set(head + i++, head + j++);
    } else if ((table[(i + 1) * cols + j] ?? 0) >= (table[i * cols + j + 1] ?? 0)) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}
