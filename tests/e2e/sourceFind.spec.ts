import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp, menu } from './app';

test('the source view edits the raw Markdown and switches back', async () => {
  const ws = createWorkspace();
  const file = ws.write('src.md', '---\ntitle: T\n---\n\n# Head\n');
  const { app, page } = await launchApp(ws, [file]);

  await menu(app, 'toggle-source');
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(source).toContainText('title: T');
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();

  await source.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nNew *text*');
  await expect.poll(() => ws.read('src.md')).toBe('---\ntitle: T\n---\n\n# Head\n\nNew *text*');

  await menu(app, 'toggle-source');
  await expect(editor(page).locator('em')).toHaveText('text');
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeEnabled();
  await closeApp(app);
});

test('find highlights matches and replace all rewrites them', async () => {
  const ws = createWorkspace();
  const file = ws.write('find.md', 'red apple, red car\n\n- red hat\n');
  const { app, page } = await launchApp(ws, [file]);
  await editor(page).click();
  await page.keyboard.press('Control+Home');
  await menu(app, 'replace');
  const find = page.getByRole('textbox', { name: 'Find' });
  await find.fill('red');
  await expect(page.locator('.find-count')).toHaveText('1 of 3');
  await expect(editor(page).locator('.search-match')).toHaveCount(3);
  await find.press('Enter');
  await expect(page.locator('.find-count')).toHaveText('2 of 3');

  await page.getByRole('textbox', { name: 'Replace' }).fill('blue');
  await page.getByRole('button', { name: 'Replace all matches' }).click();
  await expect(page.locator('.find-count')).toHaveText('No results');
  await expect.poll(() => ws.read('find.md')).toBe('blue apple, blue car\n\n- blue hat\n');

  await find.press('Escape');
  await expect(page.locator('.find-bar')).toBeHidden();
  await closeApp(app);
});
