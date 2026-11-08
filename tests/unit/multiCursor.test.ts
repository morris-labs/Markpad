import { Schema } from '@milkdown/kit/prose/model';
import { EditorState, TextSelection } from '@milkdown/kit/prose/state';
import { describe, expect, it } from 'vitest';
import {
  createMultiCursorPlugin,
  extraRanges,
  insertAll,
  normalizeRanges,
  selectAllMatches,
  selectNextMatch,
  setRanges,
  charStep,
  wordBoundary,
} from '../../src/renderer/editor/multiCursor';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: {},
  },
  marks: { strong: { toDOM: () => ['strong', 0] } },
});

function stateOf(...paragraphs: string[]): EditorState {
  const doc = schema.node(
    'doc',
    null,
    paragraphs.map((text) => schema.node('paragraph', null, text ? [schema.text(text)] : [])),
  );
  return EditorState.create({ doc, plugins: [createMultiCursorPlugin()] });
}

const text = (state: EditorState): string[] => {
  const out: string[] = [];
  state.doc.forEach((node) => out.push(node.textContent));
  return out;
};

describe('normalizeRanges', () => {
  it('sorts ranges and merges overlapping ones', () => {
    expect(
      normalizeRanges([
        { anchor: 8, head: 8 },
        { anchor: 1, head: 4 },
        { anchor: 3, head: 6 },
        { anchor: 8, head: 8 },
      ]),
    ).toEqual([
      { anchor: 1, head: 6 },
      { anchor: 8, head: 8 },
    ]);
  });
});

describe('editing at every cursor', () => {
  it('types at each cursor in one transaction', () => {
    let state = stateOf('one', 'two', 'three');
    // Positions: paragraph n starts at 1, 6, 11.
    state = state.apply(setRanges(state.tr, { anchor: 1, head: 1 }, [
      { anchor: 6, head: 6 },
      { anchor: 11, head: 11 },
    ]));
    expect(extraRanges(state)).toHaveLength(2);
    const tr = insertAll(state, '- ');
    expect(tr.steps.length).toBe(3);
    state = state.apply(tr);
    expect(text(state)).toEqual(['- one', '- two', '- three']);
    expect(state.selection.head).toBe(3);
    expect(extraRanges(state).map((r) => r.head)).toEqual([10, 17]);
  });

  it('clears the extra cursors when another command moves the selection', () => {
    let state = stateOf('one', 'two');
    state = state.apply(setRanges(state.tr, { anchor: 1, head: 1 }, [{ anchor: 6, head: 6 }]));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    expect(extraRanges(state)).toEqual([]);
  });
});

describe('selecting matches', () => {
  it('selects the word, then adds each next match', () => {
    let state = stateOf('cat dog cat', 'cat');
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    state = state.apply(selectNextMatch(state)!);
    expect([state.selection.from, state.selection.to]).toEqual([1, 4]);
    state = state.apply(selectNextMatch(state)!);
    expect([state.selection.from, state.selection.to]).toEqual([9, 12]);
    state = state.apply(selectNextMatch(state)!);
    expect(extraRanges(state)).toHaveLength(2);
    state = state.apply(insertAll(state, 'fox'));
    expect(text(state)).toEqual(['fox dog fox', 'fox']);
  });

  it('selects every match at once', () => {
    let state = stateOf('a b a', 'a');
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 2)));
    state = state.apply(selectAllMatches(state)!);
    expect(extraRanges(state)).toHaveLength(2);
  });
});

describe('wordBoundary', () => {
  it('jumps over words and the spaces before them', () => {
    const state = stateOf('alpha beta.gamma');
    expect(wordBoundary(state.doc, 1, 1)).toBe(6);
    expect(wordBoundary(state.doc, 6, 1)).toBe(11);
    expect(wordBoundary(state.doc, 11, -1)).toBe(7);
  });
});

describe('surrogate pairs', () => {
  it('steps over an emoji as one character', () => {
    const state = stateOf('a😀b');
    expect(charStep(state.doc, 2, 1)).toBe(4);
    expect(charStep(state.doc, 4, -1)).toBe(2);
  });

  it('moves word boundaries outside an emoji', () => {
    const state = stateOf('😀😀');
    expect(wordBoundary(state.doc, 1, 1) % 2).toBe(1);
    expect(wordBoundary(state.doc, 3, -1) % 2).toBe(1);
  });
});
