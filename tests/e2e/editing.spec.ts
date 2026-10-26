import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp } from './app';

test('typed Markdown syntax becomes formatting and autosaves', async () => {
  const ws = createWorkspace();
  const file = ws.write('notes.md', '');
  const { app, page } = await launchApp(ws, [file]);

  await editor(page).click();
  await page.keyboard.type('# Title');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Some **bold** text.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');

  await expect(editor(page).locator('h1')).toHaveText('Title');
  await expect(editor(page).locator('strong')).toHaveText('bold');
  await expect(editor(page).locator('li')).toHaveCount(2);

  await expect
    .poll(() => ws.read('notes.md'))
    .toBe('# Title\n\nSome **bold** text.\n\n- first\n- second\n');
  await expect(page).toHaveTitle('notes.md - Markpad');
  await closeApp(app);
});

test('opening a file never rewrites it', async () => {
  const ws = createWorkspace();
  const original = 'Title\n=====\n\n* one\n* two\n';
  const file = ws.write('styled.md', original);
  const { app, page } = await launchApp(ws, [file]);
  await expect(editor(page).locator('h1')).toHaveText('Title');
  await closeApp(app);
  expect(ws.read('styled.md')).toBe(original);
});

test('an edit keeps the rest of the file in its own style', async () => {
  const ws = createWorkspace();
  const file = ws.write('styled.md', 'Intro\n\n* one\n* two\n\n~~~\ncode\n~~~\n');
  const { app, page } = await launchApp(ws, [file]);
  await editor(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' text');
  await expect
    .poll(() => ws.read('styled.md'))
    .toBe('Intro text\n\n* one\n* two\n\n~~~\ncode\n~~~\n');
  await closeApp(app);
});
