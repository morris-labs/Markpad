/** A file's text as read from disk. */
export interface FileSnapshot {
  readonly path: string;
  readonly text: string;
  /** True if the file doesn't exist yet and opened as an empty document. */
  readonly missing?: boolean;
}

/** An untitled document stored in the app's drafts folder. */
export interface DraftSnapshot {
  readonly id: string;
  /** The absolute path of the draft's Markdown file. */
  readonly path: string;
  readonly text: string;
}

/** A tab to restore on the next launch. */
export type SessionTab =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'draft'; readonly id: string };

/** The open tabs, stored when they change and restored on launch. */
export interface Session {
  readonly tabs: readonly SessionTab[];
  readonly activeIndex: number;
}

/** What the renderer needs to build its first set of tabs. */
export interface StartupState {
  readonly session: Session;
  /** Files passed on the command line or through the OS, to open as tabs. */
  readonly openPaths: readonly string[];
}

/** An image from the clipboard or a drop, without a file on disk. */
export interface ImageBytes {
  readonly name: string;
  /** The MIME type, such as `image/png`. */
  readonly type: string;
  readonly bytes: Uint8Array;
}

export type ThemeSetting = 'system' | 'light' | 'dark';

/** Commands that the application menu sends to the renderer. */
export type MenuAction =
  | 'new'
  | 'open'
  | 'save-as'
  | 'close-tab'
  | 'next-tab'
  | 'previous-tab'
  | 'undo'
  | 'redo'
  | 'copy-html'
  | 'find'
  | 'replace'
  | 'toggle-source'
  | 'toggle-outline'
  | 'toggle-front-matter'
  | 'print'
  | 'export-html'
  | 'export-pdf';

/** A choice the user makes in a message box, by button index. */
export interface AskOptions {
  readonly message: string;
  readonly detail?: string;
  readonly buttons: readonly string[];
  readonly defaultId?: number;
  readonly cancelId?: number;
}

/** The API that the preload script exposes to the renderer as `window.markpad`. */
export interface MarkpadApi {
  readonly platform: string;

  /** Gets the startup state; the first call also starts delivering open requests. */
  getStartupState(): Promise<StartupState>;
  saveSession(session: Session): Promise<void>;

  showOpenDialog(): Promise<string[]>;
  /** Shows a save dialog and returns the chosen path, or null if canceled. */
  showSaveDialog(suggestedName: string): Promise<string | null>;
  ask(options: AskOptions): Promise<number>;

  /** Shows an image picker and returns the chosen path, or null if canceled. */
  showOpenImageDialog(): Promise<string | null>;
  /** Copies an image file into the document's assets folder and returns its relative path. */
  importImageFile(documentPath: string, imagePath: string): Promise<string>;
  /** Saves image bytes into the document's assets folder and returns their relative path. */
  importImageBytes(documentPath: string, image: ImageBytes): Promise<string>;
  /** Gets the path of a file that the user dropped or pasted, or an empty string. */
  getPathForFile(file: File): string;

  /**
   * Asks where to save an export, then writes the HTML or a PDF printed from it.
   *
   * @returns The saved path, or null if the user canceled.
   */
  exportDocument(kind: 'html' | 'pdf', suggestedPath: string, html: string): Promise<string | null>;
  /**
   * Shows the system print dialog for an exported HTML page.
   *
   * @returns True if the page was sent to a printer; false if the user canceled.
   */
  printDocument(html: string): Promise<boolean>;
  /** Puts HTML on the clipboard, with plain text for programs that can't paste HTML. */
  writeClipboard(content: { readonly html: string; readonly text: string }): Promise<void>;
  /** Shows a file in the system file manager, without opening it. */
  showInFolder(path: string): Promise<void>;

  /**
   * Reads a file.
   *
   * @param allowMissing If true, a missing file returns empty text with
   *     `missing` set; if false, it's an error. Default: false.
   */
  readFile(path: string, allowMissing?: boolean): Promise<FileSnapshot>;
  /** Writes a file atomically and stops reporting that write as an outside change. */
  writeFile(path: string, text: string): Promise<void>;
  watchFile(path: string): Promise<void>;
  unwatchFile(path: string): Promise<void>;
  addRecentFile(path: string): Promise<void>;

  createDraft(): Promise<DraftSnapshot>;
  readDraft(id: string): Promise<DraftSnapshot>;
  deleteDraft(id: string): Promise<void>;
  /** Writes a draft's text to `path`, moves its assets next to it, and deletes the draft. */
  promoteDraft(id: string, path: string, text: string): Promise<void>;

  /** Registers a listener for menu commands. */
  onMenuAction(listener: (action: MenuAction) => void): void;
  /** Registers a listener for files that the OS or a second launch asks to open. */
  onOpenPaths(listener: (paths: string[]) => void): void;
  /** Registers a listener for outside changes to watched files. */
  onFileChanged(listener: (snapshot: FileSnapshot) => void): void;
  getTheme(): Promise<ThemeSetting>;
  /** Registers a listener for changes to the theme setting in the View menu. */
  onThemeChanged(listener: (theme: ThemeSetting) => void): void;
  /** Registers the handler that flushes pending saves before the window closes. */
  onBeforeClose(handler: () => Promise<void>): void;
}
