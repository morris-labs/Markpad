import type { MarkType } from '@milkdown/kit/prose/model';
import { TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

/** A document range covered by one mark. */
export interface MarkRange {
  readonly from: number;
  readonly to: number;
  readonly attrs: Record<string, unknown>;
}

/** Finds the extent of the mark of `type` around `pos`, within one text block. */
export function findMarkRange(state: EditorState, pos: number, type: MarkType): MarkRange | null {
  const $pos = state.doc.resolve(pos);
  let childFrom = $pos.start();
  let run: { from: number; to: number; attrs: Record<string, unknown> } | null = null;
  for (let i = 0; i < $pos.parent.childCount; i++) {
    const child = $pos.parent.child(i);
    const childTo = childFrom + child.nodeSize;
    const mark = type.isInSet(child.marks);
    if (mark && run && run.to === childFrom && mark.eq(type.create(run.attrs))) {
      run.to = childTo;
    } else if (mark) {
      if (run && run.from <= pos && pos <= run.to) break;
      run = { from: childFrom, to: childTo, attrs: mark.attrs };
    } else if (run && run.from <= pos && pos <= run.to) {
      break;
    } else {
      run = null;
    }
    childFrom = childTo;
  }
  return run && run.from <= pos && pos <= run.to ? run : null;
}

/** Gets the link at the selection, if any. */
export function linkAtSelection(state: EditorState): MarkRange | null {
  const type = state.schema.marks['link'];
  if (!type) return null;
  return findMarkRange(state, state.selection.from, type);
}

/**
 * Applies a link to the selection or to the link around the cursor.
 *
 * With an empty selection outside a link, the URL is inserted as linked text.
 * An empty `href` removes the link.
 */
export function applyLink(view: EditorView, href: string): void {
  const { state } = view;
  const type = state.schema.marks['link'];
  if (!type) return;
  const existing = linkAtSelection(state);
  let { from, to } = state.selection;
  if (state.selection.empty && existing) {
    ({ from, to } = existing);
  }
  const tr = state.tr;
  if (href === '') {
    tr.removeMark(from, to, type);
  } else if (from === to) {
    tr.insertText(href, from);
    tr.addMark(from, from + href.length, type.create({ href }));
    tr.setSelection(TextSelection.create(tr.doc, from + href.length));
  } else {
    tr.removeMark(from, to, type);
    tr.addMark(from, to, type.create({ ...(existing?.attrs ?? {}), href }));
  }
  view.dispatch(tr);
  view.focus();
}

/** What a link points to, for deciding how to open it. */
export type LinkTarget =
  | { readonly kind: 'web'; readonly url: string }
  | { readonly kind: 'anchor'; readonly id: string }
  | { readonly kind: 'markdown'; readonly path: string }
  | { readonly kind: 'file'; readonly path: string };

/** Classifies a link's `href` and resolves a relative path against the document. */
export function resolveLink(href: string, documentPath: string): LinkTarget {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^file:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) {
    return { kind: 'web', url: href };
  }
  if (href.startsWith('#')) return { kind: 'anchor', id: safeDecodeComponent(href.slice(1)) };
  const withoutFragment = href.replace(/[#?].*$/, '');
  let path: string;
  if (/^file:/i.test(withoutFragment)) {
    path = safeDecodeComponent(new URL(withoutFragment).pathname).replace(/^\/([a-z]:)/i, '$1');
  } else {
    const decoded = safeDecode(withoutFragment);
    const index = Math.max(documentPath.lastIndexOf('/'), documentPath.lastIndexOf('\\'));
    const folder = index < 0 ? '' : documentPath.slice(0, index);
    path = /^([a-z]:[\\/]|[\\/])/i.test(decoded) ? decoded : joinRelative(folder, decoded);
  }
  return /\.(md|markdown|mdown|mkd)$/i.test(path)
    ? { kind: 'markdown', path }
    : { kind: 'file', path };
}

/** Like `decodeURIComponent`, but returns the text unchanged on a malformed escape. */
export function safeDecodeComponent(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function safeDecode(text: string): string {
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

/** Joins a folder and a relative path, resolving `.` and `..` segments. */
export function joinRelative(folder: string, relative: string): string {
  const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  const parts = folder.split(/[\\/]/);
  for (const segment of relative.split(/[\\/]/)) {
    if (segment === '..') parts.pop();
    else if (segment !== '.' && segment !== '') parts.push(segment);
  }
  return parts.join(separator);
}
