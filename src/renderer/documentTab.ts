import type { EditorState } from '@milkdown/kit/prose/state';
import type { SessionTab } from '@shared/api';
import { imagePlugin, refreshImages } from './editor/images';
import { linkClickPlugin } from './editor/linkClicks';
import { MarkdownDocument } from './editor/markdownDocument';
import { languageName, SourceEditor } from './sourceEditor';

const AUTOSAVE_DELAY_MS = 1000;

/** Where a tab's text lives on disk. */
export type TabSource =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'draft'; readonly id: string; readonly path: string };

/** Callbacks from a tab to the app that owns it. */
export interface TabHost {
  /** Called when the tab's title, unsaved state, or content changes. */
  readonly onTabChanged: (tab: DocumentTab) => void;
  readonly onSaveError: (tab: DocumentTab, error: unknown) => void;
  /** Opens a link that the user Ctrl+clicked in this tab. */
  readonly openLink: (tab: DocumentTab, href: string) => void;
  /** Called when the editor's state changes, including the selection. */
  readonly onEditorState: (tab: DocumentTab, state: EditorState) => void;
}

let nextTabId = 1;

/** Gets a file name from a path on any platform. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const MARKDOWN_EXTENSIONS = /\.(md|markdown|mdown|mkd|mkdn|mdx)$/i;

/** Checks whether a path names a Markdown file, which opens in the styled view. */
export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.test(path);
}

/** Gets the folder part of a path on any platform. */
export function dirName(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index < 0 ? '' : path.slice(0, index);
}

/** One open document: its editor, its file, and its autosave state. */
export class DocumentTab {
  readonly id = nextTabId++;
  /** The element that holds the tab's front matter panel and editor. */
  readonly pane: HTMLElement;
  readonly frontMatterPanel: HTMLDetailsElement;
  private readonly frontMatterInput: HTMLTextAreaElement;
  private readonly editorHost: HTMLElement;

  private documentValue: MarkdownDocument | null = null;
  private sourceView: SourceEditor | null = null;
  private readonly sourceHost: HTMLElement;
  /** The text on disk, as last read or written by this tab. */
  private savedText: string;
  /** True if the document has changed since it was last written. */
  private edited = false;
  /** True if the user has edited the document since this tab opened it. */
  private touched = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> = Promise.resolve();

  private constructor(
    public source: TabSource,
    text: string,
    private readonly host: TabHost,
  ) {
    this.savedText = text;
    this.pane = document.createElement('section');
    this.pane.className = 'document-pane';

    this.frontMatterPanel = document.createElement('details');
    this.frontMatterPanel.className = 'front-matter';
    const summary = document.createElement('summary');
    summary.textContent = 'Front matter';
    this.frontMatterInput = document.createElement('textarea');
    this.frontMatterInput.spellcheck = false;
    this.frontMatterInput.setAttribute('aria-label', 'Front matter');
    this.frontMatterInput.addEventListener('input', () => {
      if (this.documentValue) this.documentValue.frontMatter = this.frontMatterInput.value;
      this.markEdited();
    });
    this.frontMatterPanel.append(summary, this.frontMatterInput);

    this.editorHost = document.createElement('div');
    this.editorHost.className = 'editor-host';
    this.sourceHost = document.createElement('div');
    this.sourceHost.className = 'source-host';
    this.sourceHost.hidden = true;
    this.pane.append(this.frontMatterPanel, this.editorHost, this.sourceHost);
  }

  /** Creates a tab and mounts its editor. */
  static async create(source: TabSource, text: string, host: TabHost): Promise<DocumentTab> {
    const tab = new DocumentTab(source, text, host);
    if (tab.isPlainFile) tab.mountPlain(text);
    else await tab.mount(text);
    return tab;
  }

  /**
   * Checks whether the tab holds a file that isn't Markdown, such as a text or
   * code file. Such a file always shows as plain text, never in the styled view.
   */
  get isPlainFile(): boolean {
    return this.source.kind === 'file' && !isMarkdownPath(this.source.path);
  }

  /** Gets the language of a plain file, such as `JSON`, or `Plain text`. */
  get fileKind(): string {
    return this.source.kind === 'file'
      ? (languageName(baseName(this.source.path)) ?? 'Plain text')
      : 'Markdown';
  }

  /** Checks whether the tab's styled editor has finished mounting. */
  get isMounted(): boolean {
    return this.documentValue !== null;
  }

  get document(): MarkdownDocument {
    if (!this.documentValue) throw new Error('The tab has no mounted document.');
    return this.documentValue;
  }

  get title(): string {
    if (this.source.kind === 'file') return baseName(this.source.path);
    const heading = this.pane
      .querySelector('.editor-host h1, .editor-host h2')
      ?.textContent?.trim();
    return heading ? heading.slice(0, 40) : 'Untitled';
  }

  /** Checks whether an edit is waiting to be written. */
  get hasPendingSave(): boolean {
    return this.edited;
  }

  /** Checks whether closing the tab loses no work: it's unedited and has no draft text. */
  get isUnchanged(): boolean {
    return !this.touched && (this.source.kind === 'file' || this.isEmpty);
  }

  get isEmpty(): boolean {
    return this.currentText().trim() === '';
  }

  /** Checks whether the tab shows its raw Markdown source. */
  get isSourceMode(): boolean {
    return this.sourceView !== null;
  }

  /** Gets the source editor while the tab is in source mode. */
  get sourceEditor(): SourceEditor | null {
    return this.sourceView;
  }

  /** Gets the full file text from whichever view is showing. */
  currentText(): string {
    return this.sourceView ? this.sourceView.text : this.document.toFileText();
  }

  /**
   * Switches between the styled view and the raw source.
   *
   * Leaving source mode parses the source into a new document, so the undo
   * history starts over.
   */
  async toggleSourceMode(): Promise<void> {
    if (this.isPlainFile) return;
    if (this.sourceView) {
      const text = this.sourceView.text;
      this.sourceView.destroy();
      this.sourceView = null;
      this.sourceHost.hidden = true;
      this.sourceHost.replaceChildren();
      this.editorHost.hidden = false;
      await this.remount(text);
      this.document.editor.view.focus();
    } else {
      const text = this.document.toFileText();
      this.editorHost.hidden = true;
      this.frontMatterPanel.hidden = true;
      this.sourceHost.hidden = false;
      this.sourceView = new SourceEditor(this.sourceHost, text, () => this.markEdited());
      this.sourceView.focus();
    }
    this.host.onTabChanged(this);
  }

  get sessionEntry(): SessionTab {
    return this.source.kind === 'file'
      ? { kind: 'file', path: this.source.path }
      : { kind: 'draft', id: this.source.id };
  }

  /** Replaces the document with text from disk and clears any pending edit. */
  async reload(text: string): Promise<void> {
    clearTimeout(this.saveTimer);
    this.savedText = text;
    if (this.sourceView) {
      this.sourceView.setText(text);
    } else {
      await this.remount(text);
    }
    this.edited = false;
    this.host.onTabChanged(this);
  }

  private async remount(text: string): Promise<void> {
    const scroll = this.pane.scrollTop;
    await this.documentValue?.destroy();
    this.documentValue = null;
    this.editorHost.replaceChildren();
    await this.mount(text);
    this.pane.scrollTop = scroll;
  }

  /** Checks whether `text` differs from the last text this tab read or wrote. */
  differsFromSaved(text: string): boolean {
    return text !== this.savedText;
  }

  /**
   * Writes pending edits now.
   *
   * @returns False if the write failed and the edits are still unsaved; otherwise true.
   */
  async flush(): Promise<boolean> {
    clearTimeout(this.saveTimer);
    this.saving = this.saving.then(() => this.writeIfEdited());
    await this.saving;
    return !this.edited;
  }

  /** Copies an image file into this document's assets folder and returns its relative path. */
  async importImage(file: File): Promise<string> {
    const api = window.markpad;
    const path = api.getPathForFile(file);
    if (path) return api.importImageFile(this.source.path, path);
    const bytes = new Uint8Array(await file.arrayBuffer());
    return api.importImageBytes(this.source.path, {
      name: file.name || 'pasted-image',
      type: file.type,
      bytes,
    });
  }

  /** Points the tab at a different file after Save As and records it as written. */
  retarget(source: TabSource, writtenText: string): void {
    this.source = source;
    this.savedText = writtenText;
    this.edited = false;
    refreshImages(this.editorHost, source.path);
    this.host.onTabChanged(this);
  }

  async destroy(): Promise<void> {
    clearTimeout(this.saveTimer);
    this.sourceView?.destroy();
    await this.documentValue?.destroy();
    this.pane.remove();
  }

  /** Shows or hides the front matter panel, creating empty front matter if needed. */
  toggleFrontMatter(): void {
    if (this.sourceView) return;
    const doc = this.document;
    if (doc.frontMatter === null) {
      doc.frontMatter = '';
      this.markEdited();
    } else if (doc.frontMatter === '' && !this.frontMatterPanel.hidden) {
      doc.frontMatter = null;
      this.markEdited();
    }
    this.syncFrontMatterPanel();
    if (!this.frontMatterPanel.hidden) {
      this.frontMatterPanel.open = true;
      this.frontMatterInput.focus();
    }
  }

  private async mount(text: string): Promise<void> {
    this.documentValue = await MarkdownDocument.open({
      root: this.editorHost,
      text,
      onChange: () => this.markEdited(),
      onStateChange: (state) => this.host.onEditorState(this, state),
      plugins: [
        linkClickPlugin((href) => this.host.openLink(this, href)),
        imagePlugin({
          documentPath: () => this.source.path,
          importFile: (file) => this.importImage(file),
        }),
      ],
    });
    this.frontMatterInput.value = this.documentValue.frontMatter ?? '';
    this.syncFrontMatterPanel();
  }

  /** Shows a text or code file in the source editor, with its syntax highlighting. */
  private mountPlain(text: string): void {
    this.editorHost.hidden = true;
    this.frontMatterPanel.hidden = true;
    this.sourceHost.hidden = false;
    this.sourceView = new SourceEditor(this.sourceHost, text, () => this.markEdited(), {
      fileName: baseName(this.source.path),
    });
  }

  private syncFrontMatterPanel(): void {
    this.frontMatterPanel.hidden = this.document.frontMatter === null;
  }

  private markEdited(): void {
    this.edited = true;
    this.touched = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), AUTOSAVE_DELAY_MS);
    this.host.onTabChanged(this);
  }

  private async writeIfEdited(): Promise<void> {
    if (!this.edited || !(this.documentValue || this.sourceView)) return;
    this.edited = false;
    const text = this.currentText();
    if (text !== this.savedText) {
      try {
        await window.markpad.writeFile(this.source.path, text);
        this.savedText = text;
      } catch (error) {
        this.edited = true;
        this.host.onSaveError(this, error);
      }
    }
    this.host.onTabChanged(this);
  }
}
