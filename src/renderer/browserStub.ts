import type { DraftSnapshot, MarkpadApi, MenuAction, Session } from '@shared/api';

const SAMPLE = `# Welcome to Markpad

This is a **browser preview** of the editor. Files live in memory, so
nothing you type here is written to disk.

- Type Markdown such as \`**bold**\` or \`# Heading\`, and it turns into formatting.
- Use the toolbar to format text, insert tables, and switch to the source view.

| Feature | Status |
| ------- | :----: |
| Tables  |   Yes  |
`;

/**
 * Installs an in-memory stand-in for the Electron API.
 *
 * It lets the renderer run in an ordinary browser for a quick look at the
 * editor. Dialogs fall back to the browser's prompt, and nothing is written
 * to disk.
 */
export function installBrowserStub(): void {
  const files = new Map<string, string>([['/preview/welcome.md', SAMPLE]]);
  const menuListeners: Array<(action: MenuAction) => void> = [];
  let draftCount = 0;
  let session: Session = { tabs: [{ kind: 'file', path: '/preview/welcome.md' }], activeIndex: 0 };

  const draft = (id: string): DraftSnapshot => {
    const path = `/drafts/${id}/draft.md`;
    return { id, path, text: files.get(path) ?? '' };
  };

  const api: MarkpadApi = {
    platform: navigator.userAgent.includes('Mac') ? 'darwin' : 'linux',
    getStartupState: async () => ({ session, openPaths: [] }),
    saveSession: async (next) => {
      session = next;
    },
    showOpenDialog: async () => {
      const path = window.prompt('Open which file?', [...files.keys()][0]);
      return path && files.has(path) ? [path] : [];
    },
    showSaveDialog: async (name) => window.prompt('Save as', `/preview/${name.split('/').pop()}`),
    ask: async (options) =>
      window.confirm(options.message) ? (options.defaultId ?? 0) : (options.cancelId ?? 0),
    resolvePastedPaths: async (text) => {
      const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      return {
        found: lines.filter((line) => files.has(line)),
        notFound: lines.filter((line) => !files.has(line)),
      };
    },
    showTabMenu: async () => null,
    closeWindow: async () => {},
    showOpenImageDialog: async () => null,
    importImageFile: async () => {
      throw new Error('The browser preview has no file system.');
    },
    importImageBytes: async () => {
      throw new Error('The browser preview has no file system.');
    },
    getPathForFile: () => '',
    exportDocument: async () => {
      throw new Error('Export is available in the desktop app.');
    },
    printDocument: async () => {
      throw new Error('Printing is available in the desktop app.');
    },
    writeClipboard: async ({ html, text }) => {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    },
    showInFolder: async () => {},
    readFile: async (path) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`${path} doesn't exist.`);
      return { path, text };
    },
    writeFile: async (path, text) => {
      files.set(path, text);
    },
    watchFile: async () => {},
    unwatchFile: async () => {},
    addRecentFile: async () => {},
    createDraft: async () =>
      draft(`00000000-0000-4000-8000-${String(++draftCount).padStart(12, '0')}`),
    readDraft: async (id) => draft(id),
    deleteDraft: async (id) => {
      files.delete(draft(id).path);
    },
    promoteDraft: async (id, path, text) => {
      files.set(path, text);
      files.delete(draft(id).path);
    },
    getTheme: async () => 'system',
    onMenuAction: (listener) => menuListeners.push(listener),
    onOpenPaths: () => {},
    onFileChanged: () => {},
    onThemeChanged: () => {},
    onBeforeClose: () => {},
  };
  Object.defineProperty(window, 'markpad', { value: api });

  // Stand in for the application menu's shortcuts.
  const shortcuts: Record<string, MenuAction> = {
    z: 'undo',
    y: 'redo',
    f: 'find',
    h: 'replace',
    '/': 'toggle-source',
  };
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const action = event.shiftKey ? (event.key === 'Z' ? 'redo' : undefined) : shortcuts[event.key];
    if (!action) return;
    event.preventDefault();
    for (const listener of menuListeners) listener(action);
  });
}
