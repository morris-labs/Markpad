/** A file's text as read from disk. */
export interface FileSnapshot {
  readonly path: string;
  readonly text: string;
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
  | 'find'
  | 'replace'
  | 'toggle-source'
  | 'toggle-outline'
  | 'toggle-front-matter'
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

  readFile(path: string): Promise<FileSnapshot>;
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
  /** Registers the handler that flushes pending saves before the window closes. */
  onBeforeClose(handler: () => Promise<void>): void;
}
