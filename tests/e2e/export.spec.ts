import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp, menu } from './app';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

/** Makes the next save dialog return `path` without showing a window. */
async function stubSaveDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as never;
  }, path);
}

test('export to HTML writes a standalone page with embedded images', async () => {
  const ws = createWorkspace();
  mkdirSync(join(ws.docs, 'assets'));
  writeFileSync(join(ws.docs, 'assets', 'dot.png'), PNG);
  const file = ws.write(
    'report.md',
    '# Quarterly report\n\n**Bold** text.\n\n![dot](assets/dot.png)\n',
  );
  const { app, page } = await launchApp(ws, [file]);
  await expect(editor(page).locator('img[data-src]')).toBeVisible();

  const out = join(ws.docs, 'report.html');
  await stubSaveDialog(app, out);
  await menu(app, 'export-html');
  await expect(page.locator('.status-path')).toHaveText(`Exported to ${out}`);
  const html = readFileSync(out, 'utf8');
  expect(html).toContain('<title>Quarterly report</title>');
  expect(html).toContain('<strong>Bold</strong>');
  expect(html).toContain('src="data:image/png;base64,');
  expect(html).not.toContain('contenteditable');
  expect(html).not.toContain('mdimg:');
  await closeApp(app);
});

test('export to PDF writes a PDF file', async () => {
  const ws = createWorkspace();
  const file = ws.write('paper.md', '# Paper\n\nSome text.\n');
  const { app, page } = await launchApp(ws, [file]);
  const out = join(ws.docs, 'paper.pdf');
  await stubSaveDialog(app, out);
  await menu(app, 'export-pdf');
  await expect(page.locator('.status-path')).toHaveText(`Exported to ${out}`, { timeout: 15_000 });
  expect(readFileSync(out).subarray(0, 5).toString()).toBe('%PDF-');
  await closeApp(app);
});

test('the outline lists headings and jumps to one', async () => {
  const ws = createWorkspace();
  const body = Array.from({ length: 60 }, (_, i) => `Line ${i}.`).join('\n\n');
  const file = ws.write('long.md', `# Top\n\n${body}\n\n## Bottom\n\nEnd.\n`);
  const { app, page } = await launchApp(ws, [file]);
  await menu(app, 'toggle-outline');
  const items = page.locator('#outline .outline-item');
  await expect(items).toHaveText(['Top', 'Bottom']);
  await items.nth(1).click();
  await expect(editor(page).locator('h2')).toBeInViewport();
  await expect(items.nth(1)).toHaveClass(/current/);
  await closeApp(app);
});
