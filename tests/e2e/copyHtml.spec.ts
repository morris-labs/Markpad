import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp, menu } from './app';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

/** Gets the HTML and plain text on the system clipboard. */
async function readClipboard(app: ElectronApplication): Promise<{ html: string; text: string }> {
  return app.evaluate(async ({ clipboard }) => {
    const [item] = await clipboard.read();
    if (!item) return { html: '', text: '' };
    const read = async (type: string) =>
      item.types.includes(type) ? ((await item.getType(type)) as Blob).text() : '';
    return { html: await read('text/html'), text: await read('text/plain') };
  });
}

test('copy as HTML copies the document with inline light-theme styles', async () => {
  const ws = createWorkspace();
  mkdirSync(join(ws.docs, 'assets'));
  writeFileSync(join(ws.docs, 'assets', 'dot.png'), PNG);
  const file = ws.write(
    'note.md',
    '# Weekly note\n\n**Bold** and `code`.\n\n- [x] Done\n- [ ] Open\n\n![dot](assets/dot.png)\n',
  );
  const { app, page } = await launchApp(ws, [file]);
  await expect(editor(page).locator('img[data-src]')).toBeVisible();
  // The copy uses light colors even while the app shows the dark theme.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('theme:changed', 'dark');
  });

  await menu(app, 'copy-html');
  await expect(page.locator('.status-path')).toHaveText('Copied the document as HTML');
  const { html, text } = await readClipboard(app);
  expect(html).toMatch(/<h1 style="[^"]*font-size/);
  expect(html).toMatch(/<strong style="[^"]*font-weight: 700/);
  expect(html).toMatch(/<code style="[^"]*background-color/);
  expect(html).toContain('color: rgb(31, 35, 40)');
  expect(html).toContain('☑ ');
  expect(html).toContain('src="data:image/png;base64,');
  expect(html).not.toContain('class=');
  expect(html).not.toContain('contenteditable');
  expect(html).not.toContain('mdimg:');
  expect(text).toContain('Weekly note');
  await closeApp(app);
});

test('copy as HTML copies only the selection, inside its list', async () => {
  const ws = createWorkspace();
  const file = ws.write('list.md', 'Intro\n\n- first item\n- second item\n- third item\n');
  const { app, page } = await launchApp(ws, [file]);
  await editor(page).getByText('first item', { exact: true }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+End');
  await page.waitForTimeout(150);

  await menu(app, 'copy-html');
  await expect(page.locator('.status-path')).toHaveText('Copied the selection as HTML');
  const { html, text } = await readClipboard(app);
  expect(html).toMatch(/<ul[^>]*><li[^>]*>.*first item.*second item/s);
  expect(html).not.toContain('Intro');
  expect(html).not.toContain('third item');
  expect(text).toBe('first item\n\nsecond item');
  await closeApp(app);
});
