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
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { getMarkdown } from '@milkdown/kit/utils';

/** Options for {@link createEditor}. */
export interface CreateEditorOptions {
  /** The element that the editor mounts into. */
  readonly root: HTMLElement;
  /** The Markdown that the editor starts with. */
  readonly markdown: string;
  /** Extra remark-stringify options, merged over Milkdown's defaults. */
  readonly stringifyOptions?: Record<string, unknown>;
  /** Called with the serialized Markdown after each document change. */
  readonly onChange?: (markdown: string) => void;
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
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, options.root);
      ctx.set(defaultValueCtx, options.markdown);
      if (options.stringifyOptions) {
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, ...options.stringifyOptions }));
      }
      const { onChange } = options;
      if (onChange) {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) onChange(markdown);
        });
      }
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
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
