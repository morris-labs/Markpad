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
