import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  selectedRect,
} from '@milkdown/kit/prose/tables';
import type { EditorView } from '@milkdown/kit/prose/view';

export type TableAction =
  | 'row-above'
  | 'row-below'
  | 'column-left'
  | 'column-right'
  | 'delete-row'
  | 'delete-column'
  | 'delete-table'
  | 'align-left'
  | 'align-center'
  | 'align-right';

/** Where the cursor is in a table, for enabling table controls. */
export interface TablePosition {
  /** True if the cursor is in the header row, which a GFM table can't lose. */
  readonly inHeader: boolean;
  readonly columnCount: number;
  readonly alignment: string;
}

/** Gets the cursor's position in a table, or null outside a table. */
export function tablePosition(view: EditorView): TablePosition | null {
  const { state } = view;
  if (!isInTable(state)) return null;
  try {
    const rect = selectedRect(state);
    const cellPos = rect.map.map[rect.top * rect.map.width + rect.left];
    const cell = cellPos === undefined ? null : rect.table.nodeAt(cellPos);
    return {
      inHeader: rect.top === 0,
      columnCount: rect.map.width,
      alignment: typeof cell?.attrs['alignment'] === 'string' ? cell.attrs['alignment'] : 'left',
    };
  } catch {
    return null;
  }
}

/** Sets the alignment of every cell in the selected columns, as GFM aligns by column. */
function alignColumns(view: EditorView, alignment: 'left' | 'center' | 'right'): void {
  const { state } = view;
  const rect = selectedRect(state);
  const tr = state.tr;
  for (let row = 0; row < rect.map.height; row++) {
    for (let col = rect.left; col < rect.right; col++) {
      const offset = rect.map.map[row * rect.map.width + col];
      if (offset === undefined) continue;
      const pos = rect.tableStart + offset;
      const cell = tr.doc.nodeAt(pos);
      if (cell) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, alignment });
    }
  }
  view.dispatch(tr);
}

/** Runs a table action at the cursor. */
export function runTableAction(view: EditorView, action: TableAction): void {
  const { state, dispatch } = view;
  const position = tablePosition(view);
  if (!position) return;
  switch (action) {
    case 'row-above':
      // A row above the header would become the new header, so insert below instead.
      (position.inHeader ? addRowAfter : addRowBefore)(state, dispatch);
      break;
    case 'row-below':
      addRowAfter(state, dispatch);
      break;
    case 'column-left':
      addColumnBefore(state, dispatch);
      break;
    case 'column-right':
      addColumnAfter(state, dispatch);
      break;
    case 'delete-row':
      if (!position.inHeader) deleteRow(state, dispatch);
      break;
    case 'delete-column':
      if (position.columnCount > 1) deleteColumn(state, dispatch);
      else deleteTable(state, dispatch);
      break;
    case 'delete-table':
      deleteTable(state, dispatch);
      break;
    case 'align-left':
    case 'align-center':
    case 'align-right':
      alignColumns(view, action.slice('align-'.length) as 'left' | 'center' | 'right');
      break;
  }
  view.focus();
}
