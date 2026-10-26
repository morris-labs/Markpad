import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { createWorkspace } from './app';

const BINARY = join(import.meta.dirname, '../../dist/linux-unpacked/markpad');

// Runs only after `npm run dist:linux` has built the unpacked app.
test('the packaged Linux app opens a file and autosaves an edit', async () => {
  test.skip(!existsSync(BINARY), 'Build the Linux package first.');
  const ws = createWorkspace();
  const file = ws.write('packaged.md', '# Packaged\n');
  const app = await electron.launch({
    executablePath: BINARY,
    args: [`--user-data-dir=${ws.userData}`, file],
  });
  const page = await app.firstWindow();
  const editor = page.locator('.document-pane.active .ProseMirror');
  await expect(editor.locator('h1')).toHaveText('Packaged');
  await editor.locator('h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' app');
  await expect.poll(() => ws.read('packaged.md')).toBe('# Packaged app\n');
  await app.close();
});
