import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { history } from '@milkdown/kit/plugin/history';
import { prism } from '@milkdown/plugin-prism';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { Plugin, type EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose, getMarkdown } from '@milkdown/kit/utils';
import { searchPlugin } from './search';
import { taskCheckbox } from './taskList';

/** Options for {@link createEditor}. */
export interface CreateEditorOptions {
  /** The element that the editor mounts into. */
  readonly root: HTMLElement;
  /** The Markdown that the editor starts with. */
  readonly markdown: string;
  /** Extra remark-stringify options, merged over Milkdown's defaults. */
  readonly stringifyOptions?: Record<string, unknown>;
  /** Called synchronously after each transaction that changes the document. */
  readonly onChange?: () => void;
  /** Called after the editor state changes in any way, including the selection. */
  readonly onStateChange?: (state: EditorState) => void;
  /** Extra Milkdown plugins to load. */
  readonly plugins?: readonly MilkdownPlugin[];
}

/** A mounted Markdown editor. */
export interface MarkdownEditor {
  readonly editor: Editor;
  readonly view: EditorView;
  /** Gets the document serialized as Markdown. */
  getMarkdown(): string;
  /** Parses and re-serializes Markdown the way the editor would, without changing the document. */
  canonicalize(markdown: string): string;
  /** Removes the editor from the DOM and releases its resources. */
  destroy(): Promise<void>;
}

/** Creates and mounts a Milkdown editor with the CommonMark and GFM presets. */
export async function createEditor(options: CreateEditorOptions): Promise<MarkdownEditor> {
  const changeNotifier = $prose(
    () =>
      new Plugin({
        view: (view) => {
          options.onStateChange?.(view.state);
          return {
            update: (current, previous) => {
              if (!current.state.doc.eq(previous.doc)) options.onChange?.();
              options.onStateChange?.(current.state);
            },
          };
        },
      }),
  );
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, options.root);
      ctx.set(defaultValueCtx, options.markdown);
      if (options.stringifyOptions) {
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, ...options.stringifyOptions }));
      }
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(changeNotifier)
    .use(taskCheckbox)
    .use(searchPlugin)
    .use(clipboard)
    .use(cursor)
    .use(prism)
    .use([...(options.plugins ?? [])])
    .create();

  return {
    editor,
    view: editor.action((ctx) => ctx.get(editorViewCtx)),
    getMarkdown: () => editor.action(getMarkdown()),
    canonicalize: (markdown) =>
      editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(parserCtx)(markdown))),
    destroy: async () => {
      await editor.destroy();
    },
  };
}
