import type { Nodes } from 'mdast';
import { parseMarkdown } from './markdownBlocks';

/** The Markdown conventions of a file, as remark-stringify options. */
export interface MarkdownStyle {
  readonly bullet: '-' | '*' | '+';
  readonly bulletOther: '-' | '*' | '+';
  readonly bulletOrdered: '.' | ')';
  readonly incrementListMarker: boolean;
  readonly emphasis: '*' | '_';
  readonly strong: '*' | '_';
  readonly fence: '`' | '~';
  readonly rule: '-' | '*' | '_';
  readonly ruleRepetition: number;
  readonly ruleSpaces: boolean;
  readonly setext: boolean;
  readonly listItemIndent: 'one' | 'tab';
}

/** The conventions for a document that has no examples of its own. */
export const DEFAULT_STYLE: MarkdownStyle = {
  bullet: '-',
  bulletOther: '*',
  bulletOrdered: '.',
  incrementListMarker: true,
  emphasis: '*',
  strong: '*',
  fence: '`',
  rule: '-',
  ruleRepetition: 3,
  ruleSpaces: false,
  setext: false,
  listItemIndent: 'one',
};

/** Counts how often each value occurs, and returns the most frequent one. */
class Tally<T> {
  private readonly counts = new Map<T, number>();

  add(value: T): void {
    this.counts.set(value, (this.counts.get(value) ?? 0) + 1);
  }

  winner(fallback: T): T {
    let best = fallback;
    let bestCount = 0;
    for (const [value, count] of this.counts) {
      if (count > bestCount) {
        best = value;
        bestCount = count;
      }
    }
    return best;
  }
}

function walk(node: Nodes, visit: (node: Nodes) => void): void {
  visit(node);
  if ('children' in node) {
    for (const child of node.children) walk(child, visit);
  }
}

/** Detects the dominant Markdown conventions in a document. */
export function detectStyle(markdown: string): MarkdownStyle {
  const bullet = new Tally<MarkdownStyle['bullet']>();
  const bulletOrdered = new Tally<MarkdownStyle['bulletOrdered']>();
  const increment = new Tally<boolean>();
  const emphasis = new Tally<MarkdownStyle['emphasis']>();
  const strong = new Tally<MarkdownStyle['strong']>();
  const fence = new Tally<MarkdownStyle['fence']>();
  const rule = new Tally<string>();
  const setext = new Tally<boolean>();
  const indent = new Tally<MarkdownStyle['listItemIndent']>();

  const source = (node: Nodes): string => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    return start === undefined || end === undefined ? '' : markdown.slice(start, end);
  };

  walk(parseMarkdown(markdown), (node) => {
    switch (node.type) {
      case 'list': {
        const numbers: number[] = [];
        for (const item of node.children) {
          const match = /^(?:([-*+])|(\d+)([.)]))([ \t]*)/.exec(source(item));
          if (!match) continue;
          const [, bulletChar, digits, delimiter, gap = ''] = match;
          if (bulletChar === '-' || bulletChar === '*' || bulletChar === '+')
            bullet.add(bulletChar);
          if (delimiter === '.' || delimiter === ')') bulletOrdered.add(delimiter);
          if (digits !== undefined) numbers.push(Number(digits));
          // remark's "tab" mode pads the marker to a width of 4.
          const markerWidth = match[0].length - gap.length;
          if (gap.length > 1 && markerWidth + gap.length === 4) indent.add('tab');
          else if (gap.length === 1) indent.add('one');
        }
        if (numbers.length > 1) increment.add(numbers.some((n) => n !== numbers[0]));
        break;
      }
      case 'emphasis': {
        const marker = source(node)[0];
        if (marker === '*' || marker === '_') emphasis.add(marker);
        break;
      }
      case 'strong': {
        const marker = source(node)[0];
        if (marker === '*' || marker === '_') strong.add(marker);
        break;
      }
      case 'code': {
        const marker = source(node)[0];
        if (marker === '`' || marker === '~') fence.add(marker);
        break;
      }
      case 'thematicBreak':
        rule.add(source(node).trim());
        break;
      case 'heading':
        if (node.depth <= 2) setext.add(!source(node).startsWith('#'));
        break;
      default:
        break;
    }
  });

  const chosenBullet = bullet.winner(DEFAULT_STYLE.bullet);
  const ruleText = rule.winner('');
  const ruleChar = ruleText[0];
  const ruleMarks = ruleText.replace(/\s/g, '');
  return {
    bullet: chosenBullet,
    bulletOther: chosenBullet === '*' ? '-' : '*',
    bulletOrdered: bulletOrdered.winner(DEFAULT_STYLE.bulletOrdered),
    incrementListMarker: increment.winner(DEFAULT_STYLE.incrementListMarker),
    emphasis: emphasis.winner(DEFAULT_STYLE.emphasis),
    strong: strong.winner(DEFAULT_STYLE.strong),
    fence: fence.winner(DEFAULT_STYLE.fence),
    rule: ruleChar === '-' || ruleChar === '*' || ruleChar === '_' ? ruleChar : DEFAULT_STYLE.rule,
    ruleRepetition: ruleMarks.length >= 3 ? ruleMarks.length : DEFAULT_STYLE.ruleRepetition,
    ruleSpaces: ruleText.length > 0 ? /\s/.test(ruleText) : DEFAULT_STYLE.ruleSpaces,
    setext: setext.winner(DEFAULT_STYLE.setext),
    listItemIndent: indent.winner(DEFAULT_STYLE.listItemIndent),
  };
}
