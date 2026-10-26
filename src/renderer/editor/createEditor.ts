import {
  defaultValueCtx,
  Editor,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { history } from '@milkdown/kit/plugin/history';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { Plugin } from '@milkdown/kit/prose/state';
import { $prose, getMarkdown } from '@milkdown/kit/utils';

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
}

/** A mounted Markdown editor. */
export interface MarkdownEditor {
  readonly editor: Editor;
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
        view: () => ({
          update: (view, previous) => {
            if (!view.state.doc.eq(previous.doc)) options.onChange?.();
          },
        }),
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
    .use(clipboard)
    .use(cursor)
    .create();

  return {
    editor,
    getMarkdown: () => editor.action(getMarkdown()),
    canonicalize: (markdown) =>
      editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(parserCtx)(markdown))),
    destroy: async () => {
      await editor.destroy();
    },
  };
}
