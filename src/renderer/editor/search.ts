import type { Node } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

/** What to search for in the styled view. */
export interface SearchQuery {
  readonly text: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
}

export interface SearchMatch {
  readonly from: number;
  readonly to: number;
}

interface SearchState {
  readonly query: SearchQuery;
  readonly matches: readonly SearchMatch[];
  /** The index of the current match, or -1 if there is none. */
  readonly current: number;
  readonly decorations: DecorationSet;
}

const searchKey = new PluginKey<SearchState>('markpad-search');

const EMPTY_QUERY: SearchQuery = { text: '', caseSensitive: false, wholeWord: false };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Finds every match of the query in the document's text blocks. */
export function findMatches(doc: Node, query: SearchQuery): SearchMatch[] {
  if (query.text === '') return [];
  const source = escapeRegExp(query.text);
  const pattern = new RegExp(
    query.wholeWord ? `(?<![\\p{L}\\p{N}_])${source}(?![\\p{L}\\p{N}_])` : source,
    query.caseSensitive ? 'gu' : 'giu',
  );
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Match within runs of text; inline nodes such as images break a run.
    let runText = '';
    let runStart = -1;
    const flush = (): void => {
      if (runStart < 0) return;
      for (const match of runText.matchAll(pattern)) {
        if (match[0].length === 0) continue;
        matches.push({
          from: runStart + match.index,
          to: runStart + match.index + match[0].length,
        });
      }
      runText = '';
      runStart = -1;
    };
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset;
      if (child.isText) {
        if (runStart < 0) runStart = childPos;
        runText += child.text ?? '';
      } else {
        flush();
      }
    });
    flush();
    return false;
  });
  return matches;
}

function buildState(doc: Node, query: SearchQuery, current: number): SearchState {
  const matches = findMatches(doc, query);
  const index = matches.length === 0 ? -1 : Math.min(Math.max(current, 0), matches.length - 1);
  const decorations = DecorationSet.create(
    doc,
    matches.map((match, i) =>
      Decoration.inline(match.from, match.to, {
        class: i === index ? 'search-match search-match-current' : 'search-match',
      }),
    ),
  );
  return { query, matches, current: index, decorations };
}

type SearchMeta = { readonly query: SearchQuery; readonly current: number };

/** Highlights search matches in the styled view. */
export const searchPlugin = $prose(
  () =>
    new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: (_config, state) => buildState(state.doc, EMPTY_QUERY, -1),
        apply: (tr, previous) => {
          const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
          if (meta) return buildState(tr.doc, meta.query, meta.current);
          if (!tr.docChanged) return previous;
          return buildState(tr.doc, previous.query, previous.current);
        },
      },
      props: {
        decorations: (state) => searchKey.getState(state)?.decorations ?? DecorationSet.empty,
      },
    }),
);

function stateOf(state: EditorState): SearchState | undefined {
  return searchKey.getState(state);
}

/** Selects the current match and scrolls it into view. */
function revealCurrent(view: EditorView): void {
  const search = stateOf(view.state);
  const match = search?.matches[search.current];
  if (!match) return;
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, match.from, match.to))
      .scrollIntoView(),
  );
}

/** Sets the query and moves to the first match at or after the cursor. */
export function setSearchQuery(view: EditorView, query: SearchQuery): void {
  const matches = findMatches(view.state.doc, query);
  const from = view.state.selection.from;
  const current = Math.max(
    matches.findIndex((match) => match.from >= from),
    0,
  );
  view.dispatch(view.state.tr.setMeta(searchKey, { query, current } satisfies SearchMeta));
  revealCurrent(view);
}

/** Moves to the next match, or to the previous one when `step` is -1. */
export function findNext(view: EditorView, step: 1 | -1): void {
  const search = stateOf(view.state);
  if (!search || search.matches.length === 0) return;
  const count = search.matches.length;
  const current = (search.current + step + count) % count;
  view.dispatch(
    view.state.tr.setMeta(searchKey, { query: search.query, current } satisfies SearchMeta),
  );
  revealCurrent(view);
}

/** Replaces the current match and moves to the next one. */
export function replaceCurrent(view: EditorView, replacement: string): void {
  const search = stateOf(view.state);
  const match = search?.matches[search.current];
  if (!search || !match) return;
  view.dispatch(view.state.tr.insertText(replacement, match.from, match.to));
  revealCurrent(view);
}

/** Replaces every match and returns how many were replaced. */
export function replaceAll(view: EditorView, replacement: string): number {
  const search = stateOf(view.state);
  if (!search || search.matches.length === 0) return 0;
  const tr = view.state.tr;
  for (const match of [...search.matches].reverse()) {
    tr.insertText(replacement, match.from, match.to);
  }
  view.dispatch(tr);
  return search.matches.length;
}

/** Clears the highlights. */
export function clearSearch(view: EditorView): void {
  view.dispatch(
    view.state.tr.setMeta(searchKey, { query: EMPTY_QUERY, current: -1 } satisfies SearchMeta),
  );
}

/** Gets the match count and the 1-based index of the current match. */
export function searchStatus(state: EditorState): { count: number; index: number } {
  const search = stateOf(state);
  return { count: search?.matches.length ?? 0, index: (search?.current ?? -1) + 1 };
}
