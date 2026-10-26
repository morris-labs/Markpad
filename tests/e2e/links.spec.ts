import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp } from './app';

test('a plain click edits a link, and Ctrl+click opens a Markdown link in a tab', async () => {
  const ws = createWorkspace();
  ws.write('other.md', '# Other\n');
  const file = ws.write('index.md', 'See [the other note](other.md).\n');
  const { app, page } = await launchApp(ws, [file]);
  const link = editor(page).getByText('the other note');

  await link.click();
  await page.waitForTimeout(150);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(1);
  const bubble = page.locator('.link-bubble');
  await expect(bubble).toBeVisible();
  await expect(bubble.locator('.link-address')).toHaveText('other.md');

  await link.click({ modifiers: ['Control'] });
  await expect(page.locator('#tab-bar .tab-label')).toHaveText(['index.md', 'other.md']);
  await expect(editor(page).locator('h1')).toHaveText('Other');
  await closeApp(app);
});

test('the link bubble removes a link', async () => {
  const ws = createWorkspace();
  const file = ws.write('rm.md', 'A [site](https://example.com) here.\n');
  const { app, page } = await launchApp(ws, [file]);
  await editor(page).getByText('site').click();
  await page.waitForTimeout(150);
  await page.locator('.link-bubble').getByRole('button', { name: 'Remove' }).click();
  await expect.poll(() => ws.read('rm.md')).toBe('A site here.\n');
  await closeApp(app);
});
