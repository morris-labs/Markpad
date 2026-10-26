import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { closeApp, createWorkspace, launchApp, menu } from './app';

const SAMPLE = readFileSync(join(import.meta.dirname, '../fixtures/sample.md'), 'utf8');

// Set SCREENSHOT to a PNG path, and optionally THEME=dark, to capture the app.
test('screenshot', async () => {
  const out = process.env['SCREENSHOT'];
  test.skip(!out, 'Set SCREENSHOT to a PNG path to take a screenshot.');
  const ws = createWorkspace();
  const { app, page } = await launchApp(ws, [ws.write('sample.md', SAMPLE)]);
  if (process.env['THEME'] === 'dark') {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('theme:changed', 'dark');
    });
  }
  if (process.env['OUTLINE']) await menu(app, 'toggle-outline');
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out ?? '' });
  await closeApp(app);
});

// Set PDF_OUT to a PDF path to export the sample as a PDF.
test('sample pdf', async () => {
  const out = process.env['PDF_OUT'];
  test.skip(!out, 'Set PDF_OUT to a PDF path to export the sample.');
  const ws = createWorkspace();
  const { app, page } = await launchApp(ws, [ws.write('sample.md', SAMPLE)]);
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as never;
  }, out ?? '');
  await menu(app, 'export-pdf');
  await page.locator('.status-path', { hasText: 'Exported' }).waitFor();
  await closeApp(app);
});
