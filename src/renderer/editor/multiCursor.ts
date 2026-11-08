import type { Node } from '@milkdown/kit/prose/model';
import {
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@milkdown/kit/prose/state';
import { AddMarkStep, RemoveMarkStep } from '@milkdown/kit/prose/transform';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { findMatches } from './search';

/**
 * Sublime Text style multiple cursors for the styled view.
 *
 * ProseMirror has one selection, so this plugin keeps the extra ranges in its
 * own state, draws them as decorations, and replays each edit and movement at
 * every range in one transaction, so one undo reverts it. Block changes such
 * as Enter act on the main selection and clear the extra ranges.
 */

/** One cursor or selected range. */
export interface CursorRange {
  readonly anchor: number;
  readonly head: number;
}

interface MultiCursorState {
  /** The ranges besides the editor's own selection. */
  readonly extra: readonly CursorRange[];
  readonly decorations: DecorationSet;
}

export const multiCursorKey = new PluginKey<MultiCursorState>('markpad-multi-cursor');

const from = (r: CursorRange): number => Math.min(r.anchor, r.head);
const to = (r: CursorRange): number => Math.max(r.anchor, r.head);

/** Sorts ranges by position and merges the ones that overlap or touch at a cursor. */
export function normalizeRanges(ranges: readonly CursorRange[]): CursorRange[] {
  const sorted = [...ranges].sort((a, b) => from(a) - from(b));
  const out: CursorRange[] = [];
  for (const range of sorted) {
    const last = out.at(-1);
    const touches =
      from(range) === to(last ?? range) && (range.anchor === range.head || last?.anchor === last?.head);
    if (last && (from(range) < to(last) || from(range) === from(last) || touches)) {
      const end = Math.max(to(last), to(range));
      out[out.length - 1] = last.anchor <= last.head
        ? { anchor: from(last), head: end }
        : { anchor: end, head: from(last) };
      continue;
    }
    out.push(range);
  }
  return out;
}

function buildDecorations(doc: Node, extra: readonly CursorRange[]): DecorationSet {
  const decorations: Decoration[] = [];
  for (const range of extra) {
    if (range.anchor !== range.head) {
      decorations.push(Decoration.inline(from(range), to(range), { class: 'mc-selection' }));
    }
    decorations.push(
      Decoration.widget(
        range.head,
        () => {
          const caret = document.createElement('span');
          caret.className = 'mc-caret';
          return caret;
        },
        { side: -1, key: `mc-${range.head}`, ignoreSelection: true },
      ),
    );
  }
  return DecorationSet.create(doc, decorations);
}

interface Meta {
  readonly extra: readonly CursorRange[];
}

function stateFor(doc: Node, extra: readonly CursorRange[]): MultiCursorState {
  return { extra, decorations: buildDecorations(doc, extra) };
}

const EMPTY: MultiCursorState = { extra: [], decorations: DecorationSet.empty };

/** Gets the extra ranges, not counting the editor's own selection. */
export function extraRanges(state: EditorState): readonly CursorRange[] {
  return multiCursorKey.getState(state)?.extra ?? [];
}

/** Gets every range, the main selection first. */
function allRanges(state: EditorState): { main: CursorRange; extra: readonly CursorRange[] } {
  const { anchor, head } = state.selection;
  return { main: { anchor, head }, extra: extraRanges(state) };
}

/**
 * Sets the main selection and the extra ranges in a transaction.
 *
 * @param tr The transaction to change.
 * @param main The main selection, in the transaction's document.
 * @param extra The extra ranges, in the transaction's document.
 */
export function setRanges(
  tr: Transaction,
  main: CursorRange,
  extra: readonly CursorRange[],
): Transaction {
  const doc = tr.doc;
  const clamp = (pos: number): number => Math.max(0, Math.min(pos, doc.content.size));
  const valid = (r: CursorRange): CursorRange => {
    const sel = TextSelection.between(doc.resolve(clamp(r.anchor)), doc.resolve(clamp(r.head)));
    return { anchor: sel.anchor, head: sel.head };
  };
  const m = valid(main);
  const merged = normalizeRanges([m, ...extra.map(valid)]);
  // Keep the main range as the one that holds the main head.
  const mainIndex = Math.max(
    0,
    merged.findIndex((r) => from(r) <= m.head && m.head <= to(r)),
  );
  const newMain = merged[mainIndex] ?? m;
  tr.setSelection(TextSelection.create(doc, newMain.anchor, newMain.head));
  return tr.setMeta(multiCursorKey, {
    extra: merged.filter((_, i) => i !== mainIndex),
  } satisfies Meta);
}

/** Clears the extra ranges. */
export function clearRanges(tr: Transaction): Transaction {
  return tr.setMeta(multiCursorKey, { extra: [] } satisfies Meta);
}

/**
 * Applies an edit at every range, from the first to the last, in one transaction.
 *
 * @param state The editor state.
 * @param edit Changes the transaction at one range, given in the transaction's
 *   current document, and returns the cursor or range that follows the edit.
 */
function editAll(
  state: EditorState,
  edit: (tr: Transaction, range: CursorRange) => CursorRange,
): Transaction {
  const { main, extra } = allRanges(state);
  const tr = state.tr;
  const ordered = [main, ...extra]
    .map((range, index) => ({ range, index }))
    .sort((a, b) => from(a.range) - from(b.range));
  const results: Array<{ index: number; range: CursorRange; steps: number }> = [];
  for (const { range, index } of ordered) {
    const mapped = {
      anchor: tr.mapping.map(range.anchor, range.anchor <= range.head ? -1 : 1),
      head: tr.mapping.map(range.head, range.anchor <= range.head ? 1 : -1),
    };
    const after = edit(tr, mapped);
    results.push({ index, range: after, steps: tr.steps.length });
  }
  const mapped = results.map(({ index, range, steps }) => {
    const rest = tr.mapping.slice(steps);
    return { index, range: { anchor: rest.map(range.anchor), head: rest.map(range.head) } };
  });
  const newMain = mapped.find((r) => r.index === 0)?.range ?? main;
  return setRanges(
    tr,
    newMain,
    mapped.filter((r) => r.index !== 0).map((r) => r.range),
  );
}

/** Moves every range with a function of its head, extending it when asked. */
function moveAll(
  state: EditorState,
  move: (head: number, range: CursorRange) => number,
  extend: boolean,
): Transaction {
  const { main, extra } = allRanges(state);
  const step = (range: CursorRange): CursorRange => {
    const head = move(range.head, range);
    return { anchor: extend ? range.anchor : head, head };
  };
  return setRanges(state.tr, step(main), extra.map(step)).setMeta('addToHistory', false);
}

/** Inserts text in place of every range. */
export function insertAll(state: EditorState, text: string): Transaction {
  return editAll(state, (tr, range) => {
    tr.insertText(text, from(range), to(range));
    const end = from(range) + text.length;
    return { anchor: end, head: end };
  });
}

/** Gets the start of the text block that holds a position. */
function blockStart(doc: Node, pos: number): number {
  const $pos = doc.resolve(pos);
  return $pos.parent.isTextblock ? $pos.start() : pos;
}

function blockEnd(doc: Node, pos: number): number {
  const $pos = doc.resolve(pos);
  return $pos.parent.isTextblock ? $pos.end() : pos;
}

const WORD = /[\p{L}\p{N}_]/u;

/** Finds the next word boundary in a text block, the way Ctrl+Arrow does. */
export function wordBoundary(doc: Node, pos: number, dir: -1 | 1): number {
  const start = blockStart(doc, pos);
  const end = blockEnd(doc, pos);
  if (dir < 0 && pos <= start) return charStep(doc, pos, -1);
  if (dir > 0 && pos >= end) return charStep(doc, pos, 1);
  const text = doc.textBetween(start, end, undefined, '￼');
  let i = pos - start;
  const at = (k: number): string => text[dir < 0 ? k - 1 : k] ?? '';
  const inRange = (k: number): boolean => (dir < 0 ? k > 0 : k < text.length);
  while (inRange(i) && /\s/u.test(at(i))) i += dir;
  const isWord = WORD.test(at(i));
  while (inRange(i) && !/\s/u.test(at(i)) && WORD.test(at(i)) === isWord) i += dir;
  return start + snapToPair(text, i, dir);
}

/** Moves an offset out of the middle of a UTF-16 surrogate pair, in a direction. */
function snapToPair(text: string, i: number, dir: -1 | 1): number {
  const high = text.charCodeAt(i - 1);
  const low = text.charCodeAt(i);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff ? i + dir : i;
}

/** Moves one character, crossing into the next text block at a block edge. */
export function charStep(doc: Node, pos: number, dir: -1 | 1): number {
  const $pos = doc.resolve(pos);
  if ($pos.parent.isTextblock) {
    const inside = (dir < 0 && pos > $pos.start()) || (dir > 0 && pos < $pos.end());
    if (inside) {
      const text = doc.textBetween($pos.start(), $pos.end(), undefined, '￼');
      return $pos.start() + snapToPair(text, pos - $pos.start() + dir, dir);
    }
  }
  const next = pos + dir;
  if (next < 0 || next > doc.content.size) return pos;
  return Selection.findFrom(doc.resolve(next), dir, true)?.head ?? pos;
}

/** Moves a position one line up or down by its screen position. */
function lineStep(view: EditorView, pos: number, dir: -1 | 1): number {
  try {
    const coords = view.coordsAtPos(pos);
    const height = Math.max(coords.bottom - coords.top, 8);
    const y = dir < 0 ? coords.top - height / 2 : coords.bottom + height / 2;
    const found = view.posAtCoords({ left: coords.left, top: y });
    return found ? found.pos : pos;
  } catch {
    return pos;
  }
}

/** Deletes each range, or one step back or forward from each cursor. */
function deleteAll(state: EditorState, step: (doc: Node, pos: number) => number): Transaction {
  return editAll(state, (tr, range) => {
    let a = from(range);
    let b = to(range);
    if (a === b) {
      const target = step(tr.doc, a);
      // Stay inside the text block; joining blocks acts on the main cursor alone.
      if (target < blockStart(tr.doc, a) || target > blockEnd(tr.doc, a)) return range;
      a = Math.min(a, target);
      b = Math.max(b, target);
    }
    if (a !== b) tr.delete(a, b);
    return { anchor: a, head: a };
  });
}

/** Gets the word at a position as a range, or an empty range when there is none. */
function wordAt(doc: Node, pos: number): CursorRange {
  const start = blockStart(doc, pos);
  const end = blockEnd(doc, pos);
  const text = doc.textBetween(start, end, undefined, '￼');
  let a = pos - start;
  let b = a;
  while (a > 0 && WORD.test(text[a - 1] ?? '')) a -= 1;
  while (b < text.length && WORD.test(text[b] ?? '')) b += 1;
  return { anchor: start + a, head: start + b };
}

/** Selects the word at the cursor, or adds the next match of the main selection. */
export function selectNextMatch(state: EditorState): Transaction | null {
  const { main, extra } = allRanges(state);
  if (main.anchor === main.head) {
    const word = wordAt(state.doc, main.head);
    if (word.anchor === word.head) return null;
    return setRanges(state.tr, word, extra);
  }
  const text = state.doc.textBetween(from(main), to(main));
  const matches = findMatches(state.doc, { text, caseSensitive: true, wholeWord: false });
  const taken = [main, ...extra];
  const last = Math.max(...taken.map(to));
  const isTaken = (m: { from: number }): boolean => taken.some((r) => from(r) === m.from);
  const next =
    matches.find((m) => m.from >= last && !isTaken(m)) ?? matches.find((m) => !isTaken(m));
  if (!next) return null;
  return setRanges(state.tr, { anchor: next.from, head: next.to }, [...extra, main]);
}

/** Selects every match of the main selection, or of the word at the cursor. */
export function selectAllMatches(state: EditorState): Transaction | null {
  let { main } = allRanges(state);
  if (main.anchor === main.head) main = wordAt(state.doc, main.head);
  if (main.anchor === main.head) return null;
  const text = state.doc.textBetween(from(main), to(main));
  const matches = findMatches(state.doc, { text, caseSensitive: true, wholeWord: false });
  const ranges = matches.map((m) => ({ anchor: m.from, head: m.to }));
  return setRanges(state.tr, main, ranges);
}

/** Copies the text of every range, joined by line breaks, as Sublime Text does. */
function rangesText(state: EditorState): string {
  const { main, extra } = allRanges(state);
  return normalizeRanges([main, ...extra])
    .map((r) => state.doc.textBetween(from(r), to(r), '\n'))
    .join('\n');
}

/** Formats a mark change on the main selection at every other range too. */
function replicateMarks(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  const extra = extraRanges(oldState);
  if (extra.length === 0) return null;
  const main = oldState.selection;
  if (main.empty) return null;
  const tr = newState.tr;
  for (const t of transactions) {
    if (t.getMeta(multiCursorKey)) continue;
    for (const step of t.steps) {
      const isAdd = step instanceof AddMarkStep;
      if (!isAdd && !(step instanceof RemoveMarkStep)) continue;
      if (step.from !== main.from || step.to !== main.to) continue;
      for (const range of extra) {
        if (range.anchor === range.head) continue;
        if (isAdd) tr.addMark(from(range), to(range), step.mark);
        else tr.removeMark(from(range), to(range), step.mark);
      }
    }
  }
  if (!tr.docChanged) return null;
  return tr.setMeta(multiCursorKey, { extra } satisfies Meta);
}

function run(view: EditorView, tr: Transaction | null): boolean {
  if (!tr) return false;
  view.dispatch(tr.scrollIntoView());
  return true;
}

function handleKey(view: EditorView, event: KeyboardEvent): boolean {
  const state = view.state;
  const mod = event.ctrlKey || event.metaKey;
  const hasExtra = extraRanges(state).length > 0;

  if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'd') {
    run(view, selectNextMatch(state));
    return true;
  }
  if (event.altKey && !mod && event.key === 'F3') {
    run(view, selectAllMatches(state));
    return true;
  }
  if (event.altKey && event.shiftKey && !mod && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    const { main, extra } = allRanges(state);
    const ranges = [main, ...extra];
    const dir = event.key === 'ArrowUp' ? -1 : 1;
    const edge = dir < 0 ? Math.min(...ranges.map((r) => r.head)) : Math.max(...ranges.map((r) => r.head));
    const pos = lineStep(view, edge, dir);
    if (pos === edge) return true;
    return run(view, setRanges(state.tr, main, [...extra, { anchor: pos, head: pos }]));
  }
  if (!hasExtra) return false;

  if (event.key === 'Escape') {
    const head = state.selection.head;
    return run(view, clearRanges(state.tr.setSelection(TextSelection.create(state.doc, head))));
  }
  if (event.isComposing) return false;

  const shift = event.shiftKey;
  const word = event.ctrlKey || event.altKey;
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowRight': {
      const dir = event.key === 'ArrowLeft' ? -1 : 1;
      return run(
        view,
        moveAll(
          state,
          (head, range) => {
            if (!shift && !word && range.anchor !== range.head) return dir < 0 ? from(range) : to(range);
            return word ? wordBoundary(state.doc, head, dir) : charStep(state.doc, head, dir);
          },
          shift,
        ),
      );
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      if (event.altKey || mod) return false;
      const dir = event.key === 'ArrowUp' ? -1 : 1;
      return run(view, moveAll(state, (head) => lineStep(view, head, dir), shift));
    }
    case 'Home':
      return run(view, moveAll(state, (head) => blockStart(state.doc, head), shift));
    case 'End':
      return run(view, moveAll(state, (head) => blockEnd(state.doc, head), shift));
    case 'Backspace':
      return run(
        view,
        deleteAll(state, (doc, pos) => (word ? wordBoundary(doc, pos, -1) : charStep(doc, pos, -1))),
      );
    case 'Delete':
      return run(
        view,
        deleteAll(state, (doc, pos) => (word ? wordBoundary(doc, pos, 1) : charStep(doc, pos, 1))),
      );
    case 'Tab':
      return run(view, insertAll(state, '\t'));
    default:
      break;
  }
  if (mod && !shift && event.key.toLowerCase() === 'a') {
    run(view, clearRanges(state.tr));
    return false;
  }
  return false;
}

/** The ProseMirror plugin that holds and draws the extra ranges. */
export function createMultiCursorPlugin(): Plugin<MultiCursorState> {
  return new Plugin<MultiCursorState>({
    key: multiCursorKey,
    state: {
      init: () => EMPTY,
      apply(tr, value, _old, newState) {
        const meta = tr.getMeta(multiCursorKey) as Meta | undefined;
        if (meta) return meta.extra.length ? stateFor(newState.doc, meta.extra) : EMPTY;
        if (value.extra.length === 0) return value;
        // Another command changed the document or moved the selection: the
        // extra ranges apply only to edits this plugin makes.
        if (tr.docChanged || tr.selectionSet) return EMPTY;
        return value;
      },
    },
    appendTransaction: replicateMarks,
    props: {
      decorations: (state) => multiCursorKey.getState(state)?.decorations,
      handleKeyDown: handleKey,
      handleTextInput(view, _from, _to, text) {
        if (extraRanges(view.state).length === 0) return false;
        view.dispatch(insertAll(view.state, text).scrollIntoView());
        return true;
      },
      handleClick(view, pos, event) {
        if (!event.altKey) return false;
        const { main, extra } = allRanges(view.state);
        view.dispatch(setRanges(view.state.tr, { anchor: pos, head: pos }, [...extra, main]));
        return true;
      },
      handlePaste(view, event) {
        const extra = extraRanges(view.state);
        if (extra.length === 0) return false;
        const text = event.clipboardData?.getData('text/plain') ?? '';
        const lines = text.split(/\r?\n/);
        const count = extra.length + 1;
        if (lines.length === count) {
          // One line per cursor, in document order, as Sublime Text does.
          // editAll visits the ranges in document order.
          let next = 0;
          view.dispatch(
            editAll(view.state, (tr, range) => {
              const line = lines[next++] ?? '';
              tr.insertText(line, from(range), to(range));
              const end = from(range) + line.length;
              return { anchor: end, head: end };
            }),
          );
          return true;
        }
        if (lines.length > 1) {
          view.dispatch(clearRanges(view.state.tr));
          return false;
        }
        view.dispatch(insertAll(view.state, text));
        return true;
      },
      handleDOMEvents: {
        copy(view, event) {
          if (extraRanges(view.state).length === 0) return false;
          event.clipboardData?.setData('text/plain', rangesText(view.state));
          event.preventDefault();
          return true;
        },
        cut(view, event) {
          if (extraRanges(view.state).length === 0) return false;
          event.clipboardData?.setData('text/plain', rangesText(view.state));
          event.preventDefault();
          view.dispatch(deleteAll(view.state, (_doc, pos) => pos));
          return true;
        },
        compositionstart(view) {
          if (extraRanges(view.state).length > 0) view.dispatch(clearRanges(view.state.tr));
          return false;
        },
      },
    },
  });
}

/** The Milkdown plugin for multiple cursors. */
export const multiCursor = $prose(() => createMultiCursorPlugin());
