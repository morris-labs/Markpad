import { createEditor, type MarkdownEditor } from './createEditor';
import { formatMarkdownFile, parseMarkdownFile, type MarkdownFile } from './markdownFile';
import { DEFAULT_STYLE, detectStyle } from './markdownStyle';
import { BlockPreserver } from './preserveBlocks';

/** Options for {@link openMarkdownDocument}. */
export interface OpenDocumentOptions {
  /** The element that the editor mounts into. */
  readonly root: HTMLElement;
  /** The file's text as it is on disk, or an empty string for a new document. */
  readonly text: string;
  /** Called after each edit to the body. */
  readonly onChange?: () => void;
}

/** An editor bound to one Markdown file that writes the file back in its own style. */
export class MarkdownDocument {
  /** The front matter, or null if the document has none. */
  frontMatter: string | null;

  private constructor(
    readonly editor: MarkdownEditor,
    private readonly file: MarkdownFile,
    private readonly preserver: BlockPreserver,
  ) {
    this.frontMatter = file.frontMatter;
  }

  /** Gets the full file text to write to disk. */
  toFileText(): string {
    const body = this.preserver.restore(this.editor.getMarkdown());
    return formatMarkdownFile(this.file, this.frontMatter, body);
  }

  /** Removes the editor from the DOM. */
  async destroy(): Promise<void> {
    await this.editor.destroy();
  }

  /** Opens file text in a new editor mounted in `options.root`. */
  static async open(options: OpenDocumentOptions): Promise<MarkdownDocument> {
    const file = parseMarkdownFile(options.text);
    const style = file.body === '' ? DEFAULT_STYLE : detectStyle(file.body);
    const { onChange } = options;
    const editor = await createEditor({
      root: options.root,
      markdown: file.body,
      stringifyOptions: { ...style },
      ...(onChange ? { onChange: () => onChange() } : {}),
    });
    const preserver = new BlockPreserver(file.body, editor.canonicalize);
    return new MarkdownDocument(editor, file, preserver);
  }
}
