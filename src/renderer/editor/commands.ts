import { commandsCtx, editorViewCtx, type CmdKey, type Editor } from '@milkdown/kit/core';
import { redoCommand, undoCommand } from '@milkdown/kit/plugin/history';
import {
  createCodeBlockCommand,
  insertHrCommand,
  liftListItemCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { lift } from '@milkdown/kit/prose/commands';
import type { Node } from '@milkdown/kit/prose/model';
import { TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

/** The formatting at the selection, for toolbar button states. */
export interface FormatState {
  readonly strong: boolean;
  readonly emphasis: boolean;
  readonly strike: boolean;
  readonly code: boolean;
  readonly link: boolean;
  /** 0 for a paragraph, 1-6 for a heading, or -1 for any other block. */
  readonly headingLevel: number;
  readonly bulletList: boolean;
  readonly orderedList: boolean;
  readonly taskList: boolean;
  readonly blockquote: boolean;
  readonly codeBlock: boolean;
  readonly table: boolean;
}

/** Reads the formatting at the selection. */
export function getFormatState(state: EditorState): FormatState {
  const { $from, from, to, empty } = state.selection;
  const hasMark = (name: string): boolean => {
    const type = state.schema.marks[name];
    if (!type) return false;
    if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
    return state.doc.rangeHasMark(from, to, type);
  };

  const ancestors: Node[] = [];
  for (let depth = $from.depth; depth > 0; depth--) ancestors.push($from.node(depth));
  const has = (name: string): boolean => ancestors.some((node) => node.type.name === name);
  const nearestList = ancestors.find(
    (node) => node.type.name === 'bullet_list' || node.type.name === 'ordered_list',
  );
  const nearestItem = ancestors.find((node) => node.type.name === 'list_item');
  const isTask = nearestItem !== undefined && nearestItem.attrs['checked'] != null;

  const parent = $from.parent;
  let headingLevel = -1;
  if (parent.type.name === 'paragraph') headingLevel = 0;
  if (parent.type.name === 'heading') headingLevel = Number(parent.attrs['level']);

  return {
    strong: hasMark('strong'),
    emphasis: hasMark('emphasis'),
    strike: hasMark('strike_through'),
    code: hasMark('inlineCode'),
    link: hasMark('link'),
    headingLevel,
    bulletList: nearestList?.type.name === 'bullet_list' && !isTask,
    orderedList: nearestList?.type.name === 'ordered_list',
    taskList: isTask,
    blockquote: has('blockquote'),
    codeBlock: parent.type.name === 'code_block',
    table: has('table'),
  };
}

/** Formatting actions that the toolbar and shortcuts run on an editor. */
export type FormatAction =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'blockquote'
  | 'code-block'
  | 'hr'
  | 'undo'
  | 'redo';

/**
 * Copies the DOM selection into the editor state.
 *
 * ProseMirror applies DOM selection changes asynchronously, so a toolbar
 * command that runs right after a click could otherwise act on the old
 * selection.
 */
function syncSelectionFromDom(view: EditorView): void {
  const selection = view.dom.ownerDocument.getSelection();
  const { anchorNode, focusNode } = selection ?? {};
  if (!selection || !anchorNode || !focusNode) return;
  if (!view.dom.contains(anchorNode) || !view.dom.contains(focusNode)) return;
  try {
    const anchor = view.posAtDOM(anchorNode, selection.anchorOffset);
    const head = view.posAtDOM(focusNode, selection.focusOffset);
    const current = view.state.selection;
    if (current instanceof TextSelection && current.anchor === anchor && current.head === head) {
      return;
    }
    if (!(current instanceof TextSelection) && current.from === Math.min(anchor, head)) return;
    const next = TextSelection.between(
      view.state.doc.resolve(anchor),
      view.state.doc.resolve(head),
    );
    view.dispatch(view.state.tr.setSelection(next));
  } catch {
    // The DOM selection is in a spot with no document position.
  }
}

function view(editor: Editor): EditorView {
  const editorView = editor.action((ctx) => ctx.get(editorViewCtx));
  syncSelectionFromDom(editorView);
  return editorView;
}

function call<T>(editor: Editor, key: CmdKey<T>, payload?: T): boolean {
  return editor.action((ctx) => ctx.get(commandsCtx).call(key, payload));
}

/** Lifts the selection out of its list, so a list button toggles the list off. */
function liftOutOfList(editor: Editor): void {
  while (call(editor, liftListItemCommand.key)) {
    // Each call lifts one level of nesting.
  }
}

/** Sets or clears the task checkbox on every list item in the selection. */
function setTaskItems(editor: Editor, task: boolean): void {
  const v = view(editor);
  const { state } = v;
  const { from, to } = state.selection;
  const tr = state.tr;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'list_item') {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: task ? false : null });
    }
  });
  if (tr.docChanged) v.dispatch(tr);
}

/** Runs a formatting action on the editor and returns focus to it. */
export function runFormatAction(editor: Editor, action: FormatAction): void {
  const state = getFormatState(view(editor).state);
  switch (action) {
    case 'bold':
      call(editor, toggleStrongCommand.key);
      break;
    case 'italic':
      call(editor, toggleEmphasisCommand.key);
      break;
    case 'strike':
      call(editor, toggleStrikethroughCommand.key);
      break;
    case 'code':
      call(editor, toggleInlineCodeCommand.key);
      break;
    case 'bullet-list':
      if (state.bulletList) {
        liftOutOfList(editor);
      } else {
        if (state.orderedList || state.taskList) liftOutOfList(editor);
        call(editor, wrapInBulletListCommand.key);
      }
      break;
    case 'ordered-list':
      if (state.orderedList) {
        liftOutOfList(editor);
      } else {
        if (state.bulletList || state.taskList) liftOutOfList(editor);
        call(editor, wrapInOrderedListCommand.key);
      }
      break;
    case 'task-list':
      if (state.taskList) {
        setTaskItems(editor, false);
        liftOutOfList(editor);
      } else {
        if (!state.bulletList) {
          if (state.orderedList) liftOutOfList(editor);
          call(editor, wrapInBulletListCommand.key);
        }
        setTaskItems(editor, true);
      }
      break;
    case 'blockquote':
      if (state.blockquote) {
        const v = view(editor);
        lift(v.state, v.dispatch);
      } else {
        call(editor, wrapInBlockquoteCommand.key);
      }
      break;
    case 'code-block':
      if (state.codeBlock) {
        call(editor, wrapInHeadingCommand.key, 0);
      } else {
        call(editor, createCodeBlockCommand.key);
      }
      break;
    case 'hr':
      call(editor, insertHrCommand.key);
      break;
    case 'undo':
      call(editor, undoCommand.key);
      break;
    case 'redo':
      call(editor, redoCommand.key);
      break;
  }
  view(editor).focus();
}

/** Turns the current block into a paragraph (level 0) or a heading. */
export function setHeadingLevel(editor: Editor, level: number): void {
  call(editor, wrapInHeadingCommand.key, level);
  view(editor).focus();
}

export function insertTable(editor: Editor, rows: number, cols: number): void {
  call(editor, insertTableCommand.key, { row: rows, col: cols });
  view(editor).focus();
}

export function editorView(editor: Editor): EditorView {
  return view(editor);
}
