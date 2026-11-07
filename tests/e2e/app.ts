import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

/** A temporary folder for one test's user data and documents. */
export interface Workspace {
  readonly userData: string;
  readonly docs: string;
  /** Writes a document into the docs folder and returns its path. */
  write(name: string, text: string): string;
  read(name: string): string;
}

export function createWorkspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'markpad-'));
  const userData = join(root, 'user-data');
  const docs = mkdtempSync(join(root, 'docs-'));
  return {
    userData,
    docs,
    write: (name, text) => {
      const path = join(docs, name);
      writeFileSync(path, text);
      return path;
    },
    read: (name) => readFileSync(join(docs, name), 'utf8'),
  };
}

/** Launches the built app with an isolated user data folder. */
export async function launchApp(
  workspace: Workspace,
  files: readonly string[] = [],
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${workspace.userData}`, ...files],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  });
  const page = await app.firstWindow();
  await expect(page.locator('.document-pane.active :is(.ProseMirror, .cm-content)')).toBeVisible();
  return { app, page };
}

/** The editable area of the active tab. */
export function editor(page: Page) {
  return page.locator('.document-pane.active .ProseMirror');
}

/** Sends a menu command to the renderer, as the application menu does. */
export async function menu(app: ElectronApplication, action: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, value) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('menu:action', value);
  }, action);
}

/** Closes the app the way the user does, so pending saves are flushed. */
export async function closeApp(app: ElectronApplication): Promise<void> {
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await closed;
}
