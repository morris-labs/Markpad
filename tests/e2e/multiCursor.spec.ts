import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, launchApp } from './app';

test('the code view edits at several cursors with Sublime Text shortcuts', async () => {
  const ws = createWorkspace();
  const file = ws.write('list.txt', 'item one\nitem two\nitem three\n');
  const { app, page } = await launchApp(ws, [file]);
  const content = page.locator('.document-pane.active .cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+Home');

  // Ctrl+D selects the word, then the next two matches; typing replaces all three.
  await page.keyboard.press('ControlOrMeta+d');
  await page.keyboard.press('ControlOrMeta+d');
  await page.keyboard.press('ControlOrMeta+d');
  await page.keyboard.type('entry');
  await expect.poll(() => ws.read('list.txt')).toBe('entry one\nentry two\nentry three\n');

  // Ctrl+A, then Ctrl+Shift+L puts a cursor at the end of each line.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+Shift+l');
  await page.keyboard.press('End');
  await page.keyboard.type(';');
  await expect.poll(() => ws.read('list.txt')).toBe('entry one;\nentry two;\nentry three;\n');
  await closeApp(app);
});
