import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import type { AskOptions, MenuAction, Session, StartupState, ThemeSetting } from '@shared/api';
import icon from '../../resources/icon.png?asset';
import { parseFileArgs } from './args';
import { installCommand, uninstallCommand, type CommandResult } from './cliInstaller';
import { installContextMenu } from './contextMenu';
import { DraftStore } from './drafts';
import { FileWatcher, readText, writeFileAtomic } from './fileStore';
import {
  handleImageScheme,
  IMAGE_EXTENSIONS,
  importImage,
  registerImageSchemePrivileges,
  type ImageImport,
} from './images';
import { exportHtml, exportPdf } from './exporter';
import { installMenu } from './menu';
import { Settings } from './settings';

const MARKDOWN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
  { name: 'All files', extensions: ['*'] },
];

let mainWindow: BrowserWindow | null = null;
let rendererReady = false;
let closeConfirmed = false;
const pendingOpenPaths: string[] = [];

const settings = new Settings(app.getPath('userData'));
const drafts = new DraftStore(join(app.getPath('userData'), 'drafts'));
const watcher = new FileWatcher((path, text) => {
  mainWindow?.webContents.send('file:changed', { path, text });
});

/** Gets the existing files among command-line arguments. */
function filesFromArgs(argv: readonly string[], cwd: string): string[] {
  return parseFileArgs(argv.slice(app.isPackaged ? 1 : 2), cwd);
}

function requestOpen(paths: readonly string[]): void {
  if (paths.length === 0) return;
  if (rendererReady && mainWindow) {
    mainWindow.webContents.send('app:openPaths', paths);
  } else {
    pendingOpenPaths.push(...paths);
  }
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
}

function sendMenuAction(action: MenuAction): void {
  mainWindow?.webContents.send('menu:action', action);
}

function refreshMenu(): void {
  installMenu(
    {
      send: sendMenuAction,
      openRecent: (path) => requestOpen([path]),
      clearRecent: () => void settings.clearRecent().then(refreshMenu),
      setTheme: (theme) => void applyTheme(theme),
      installCommand: () => void reportCommandResult(installCommand),
      uninstallCommand: () => void reportCommandResult(uninstallCommand),
    },
    settings.recent,
    settings.theme,
  );
}

/** Runs the mdv installer or remover and shows what happened. */
async function reportCommandResult(action: () => Promise<CommandResult>): Promise<void> {
  let result: CommandResult;
  let type: 'info' | 'error' = 'info';
  try {
    result = await action();
  } catch (error) {
    type = 'error';
    result = {
      message: "Markpad couldn't change the 'mdv' command.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const options = { type, message: result.message, detail: result.detail, buttons: ['OK'] };
  if (mainWindow) await dialog.showMessageBox(mainWindow, options);
  else await dialog.showMessageBox(options);
}

async function applyTheme(theme: ThemeSetting): Promise<void> {
  nativeTheme.themeSource = theme;
  mainWindow?.webContents.send('theme:changed', theme);
  await settings.setTheme(theme);
  refreshMenu();
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 480,
    minHeight: 320,
    title: 'Markpad',
    show: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  installContextMenu(win);

  // The renderer flushes pending saves, then sends `app:closeReady`.
  win.on('close', (event) => {
    if (closeConfirmed || !rendererReady) return;
    event.preventDefault();
    win.webContents.send('app:beforeClose');
  });
  win.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
    closeConfirmed = false;
    watcher.closeAll();
  });

  // Links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
  return win;
}

function registerIpc(): void {
  ipcMain.handle('session:startup', async (): Promise<StartupState> => {
    rendererReady = true;
    const openPaths = pendingOpenPaths.splice(0);
    return { session: settings.session, openPaths };
  });
  ipcMain.handle('theme:get', () => settings.theme);
  ipcMain.handle('session:save', async (_event, session: Session) => {
    await settings.setSession(session);
    const keep = new Set(session.tabs.flatMap((tab) => (tab.kind === 'draft' ? [tab.id] : [])));
    await drafts.pruneEmpty(keep);
  });

  ipcMain.handle('dialog:open', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: MARKDOWN_FILTERS,
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('dialog:save', async (_event, suggestedName: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggestedName,
      filters: MARKDOWN_FILTERS,
    });
    return result.canceled || !result.filePath ? null : result.filePath;
  });
  ipcMain.handle('dialog:ask', async (_event, options: AskOptions) => {
    if (!mainWindow) return options.cancelId ?? 0;
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      message: options.message,
      detail: options.detail,
      buttons: [...options.buttons],
      defaultId: options.defaultId,
      cancelId: options.cancelId,
      noLink: true,
    });
    return result.response;
  });

  ipcMain.handle('dialog:openImage', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle('image:importFile', async (_event, documentPath: string, imagePath: string) => {
    const bytes = await readFile(imagePath);
    return importImage(documentPath, { name: basename(imagePath), type: '', bytes });
  });
  ipcMain.handle('image:importBytes', (_event, documentPath: string, image: ImageImport) =>
    importImage(documentPath, image),
  );

  // Linked files are revealed, not opened, so a document can't launch a program.
  ipcMain.handle('shell:showInFolder', (_event, path: string) => shell.showItemInFolder(path));

  ipcMain.handle(
    'export:save',
    async (_event, kind: 'html' | 'pdf', suggestedPath: string, html: string) => {
      if (!mainWindow) return null;
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: suggestedPath.replace(/\.[^./\\]*$/, '') + `.${kind}`,
        filters: [
          kind === 'html'
            ? { name: 'Web page', extensions: ['html', 'htm'] }
            : { name: 'PDF', extensions: ['pdf'] },
        ],
      });
      if (result.canceled || !result.filePath) return null;
      if (kind === 'html') await exportHtml(result.filePath, html);
      else await exportPdf(result.filePath, html);
      return result.filePath;
    },
  );

  ipcMain.handle('file:read', async (_event, path: string, allowMissing = false) => {
    try {
      const text = await readText(path);
      watcher.noteWrite(path, text);
      return { path, text };
    } catch (error) {
      // A file named on the command line might not exist yet; it opens empty.
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (allowMissing && missing) return { path, text: '', missing: true };
      throw error;
    }
  });
  ipcMain.handle('file:write', async (_event, path: string, text: string) => {
    watcher.noteWrite(path, text);
    await writeFileAtomic(path, text);
  });
  ipcMain.handle('file:watch', (_event, path: string) => watcher.watch(path));
  ipcMain.handle('file:unwatch', (_event, path: string) => watcher.unwatch(path));
  ipcMain.handle('file:addRecent', async (_event, path: string) => {
    if (drafts.isDraftPath(path)) return;
    await settings.addRecent(path);
    app.addRecentDocument(path);
    refreshMenu();
  });

  ipcMain.handle('draft:create', () => drafts.create());
  ipcMain.handle('draft:read', (_event, id: string) => drafts.read(id));
  ipcMain.handle('draft:delete', (_event, id: string) => drafts.delete(id));
  ipcMain.handle('draft:promote', async (_event, id: string, path: string, text: string) => {
    watcher.noteWrite(path, text);
    await drafts.promote(id, path, text);
  });

  ipcMain.on('app:closeReady', () => {
    closeConfirmed = true;
    mainWindow?.close();
  });
}

// `markpad --version` prints the version for the mdv command, then exits.
const versionRequested = process.argv
  .slice(app.isPackaged ? 1 : 2)
  .some((arg) => arg === '--version' || arg === '-v');
if (versionRequested) {
  process.stdout.write(`Markpad ${app.getVersion()}\n`);
  app.exit(0);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, cwd) => requestOpen(filesFromArgs(argv, cwd)));
  // macOS delivers files opened from Finder through this event, even before ready.
  app.on('open-file', (event, path) => {
    event.preventDefault();
    requestOpen([path]);
    if (app.isReady() && !mainWindow) mainWindow = createWindow();
  });

  pendingOpenPaths.push(...filesFromArgs(process.argv, process.cwd()));
  registerImageSchemePrivileges();

  void app.whenReady().then(async () => {
    await settings.load();
    handleImageScheme();
    nativeTheme.themeSource = settings.theme;
    registerIpc();
    refreshMenu();
    mainWindow = createWindow();
    app.on('activate', () => {
      if (!mainWindow) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
