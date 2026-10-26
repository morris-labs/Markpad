import type { EditorState } from '@milkdown/kit/prose/state';
import type { SessionTab } from '@shared/api';
import { MarkdownDocument } from './editor/markdownDocument';

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
  /** Called when the editor's state changes, including the selection. */
  readonly onEditorState: (tab: DocumentTab, state: EditorState) => void;
}

let nextTabId = 1;

/** Gets a file name from a path on any platform. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
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
  /** The text on disk, as last read or written by this tab. */
  private savedText: string;
  /** True if the document has changed since it was last written. */
  private edited = false;
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
    this.pane.append(this.frontMatterPanel, this.editorHost);
  }

  /** Creates a tab and mounts its editor. */
  static async create(source: TabSource, text: string, host: TabHost): Promise<DocumentTab> {
    const tab = new DocumentTab(source, text, host);
    await tab.mount(text);
    return tab;
  }

  /** Checks whether the tab's editor has finished mounting. */
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

  get isEmpty(): boolean {
    return this.document.toFileText().trim() === '';
  }

  get sessionEntry(): SessionTab {
    return this.source.kind === 'file'
      ? { kind: 'file', path: this.source.path }
      : { kind: 'draft', id: this.source.id };
  }

  /** Replaces the document with text from disk and clears any pending edit. */
  async reload(text: string): Promise<void> {
    clearTimeout(this.saveTimer);
    this.edited = false;
    this.savedText = text;
    const scroll = this.pane.scrollTop;
    await this.documentValue?.destroy();
    this.editorHost.replaceChildren();
    await this.mount(text);
    this.pane.scrollTop = scroll;
    this.host.onTabChanged(this);
  }

  /** Checks whether `text` differs from the last text this tab read or wrote. */
  differsFromSaved(text: string): boolean {
    return text !== this.savedText;
  }

  /** Writes pending edits now. */
  async flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    this.saving = this.saving.then(() => this.writeIfEdited());
    await this.saving;
  }

  /** Points the tab at a different file after Save As and records it as written. */
  retarget(source: TabSource, writtenText: string): void {
    this.source = source;
    this.savedText = writtenText;
    this.edited = false;
    this.host.onTabChanged(this);
  }

  async destroy(): Promise<void> {
    clearTimeout(this.saveTimer);
    await this.documentValue?.destroy();
    this.pane.remove();
  }

  /** Shows or hides the front matter panel, creating empty front matter if needed. */
  toggleFrontMatter(): void {
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
    });
    this.frontMatterInput.value = this.documentValue.frontMatter ?? '';
    this.syncFrontMatterPanel();
  }

  private syncFrontMatterPanel(): void {
    this.frontMatterPanel.hidden = this.document.frontMatter === null;
  }

  private markEdited(): void {
    this.edited = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), AUTOSAVE_DELAY_MS);
    this.host.onTabChanged(this);
  }

  private async writeIfEdited(): Promise<void> {
    if (!this.edited || !this.documentValue) return;
    this.edited = false;
    const text = this.documentValue.toFileText();
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
