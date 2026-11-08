import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp } from './app';

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

test('the styled view edits at several cursors', async () => {
  const ws = createWorkspace();
  const file = ws.write('notes.md', 'cat one\n\ncat two\n\ncat three\n');
  const { app, page } = await launchApp(ws, [file]);
  await editor(page).locator('p').first().click();
  await page.keyboard.press('ControlOrMeta+Home');

  // Ctrl+D picks the word and its next matches; typing replaces each one.
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ControlOrMeta+d');
  await expect(editor(page).locator('.mc-selection')).toHaveCount(2);
  await page.keyboard.type('dog');
  await expect.poll(() => ws.read('notes.md')).toBe('dog one\n\ndog two\n\ndog three\n');

  // The cursors move together; Backspace and bold act at each one.
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Shift+ControlOrMeta+ArrowLeft');
  await page.keyboard.press('ControlOrMeta+b');
  await expect
    .poll(() => ws.read('notes.md'))
    .toBe('dog **one**\n\ndog **two**\n\ndog **three**\n');

  // One undo reverts the edit at every cursor, and Escape keeps one cursor.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => ws.read('notes.md')).toBe('dog one\n\ndog two\n\ndog three\n');
  await page.keyboard.press('Escape');
  await expect(editor(page).locator('.mc-caret')).toHaveCount(0);
  await closeApp(app);
});

test('Alt+Shift+Down and copy and paste spread over the cursors', async () => {
  const ws = createWorkspace();
  const file = ws.write('rows.md', 'a\n\nb\n\nc\n');
  const { app, page } = await launchApp(ws, [file]);
  await editor(page).locator('p').first().click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(editor(page).locator('.mc-caret')).toHaveCount(2);
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('End');
  await page.keyboard.type('-');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => ws.read('rows.md')).toBe('a-a\n\nb-b\n\nc-c\n');
  await closeApp(app);
});
