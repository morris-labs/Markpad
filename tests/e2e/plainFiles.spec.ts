import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, launchApp, menu } from './app';

test('code and text files open as highlighted text, and edits save unchanged', async () => {
  const ws = createWorkspace();
  const json = ws.write('data.json', '{\n  "name": "Markpad",\n  "count": 2\n}\n');
  const java = ws.write('Main.java', 'public class Main {\n  // A comment\n}\n');
  const text = ws.write('notes.txt', '# Not a heading\n- not a list\n');
  const { app, page } = await launchApp(ws, [json, java, text]);
  const source = page.locator('.document-pane.active .cm-content');

  await expect(source).toHaveText(/# Not a heading/);
  await expect(page.locator('.document-pane.active .ProseMirror')).toHaveCount(0);
  await expect(page.locator('.status-path')).toContainText('Plain text');

  await page.locator('#tab-bar .tab', { hasText: 'Main.java' }).click();
  await expect(page.locator('.status-path')).toContainText('Java');
  // The Java grammar loads on demand, then colors the comment.
  await expect(source.locator('span', { hasText: '// A comment' })).toHaveCSS('color', /rgb/);

  await page.locator('#tab-bar .tab', { hasText: 'data.json' }).click();
  await menu(app, 'toggle-source');
  await expect(source).toBeVisible();
  await source.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n');
  await expect
    .poll(() => ws.read('data.json'))
    .toBe('{\n  "name": "Markpad",\n  "count": 2\n}\n\n');
  await closeApp(app);
});
