import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp } from './app';

test('table controls add rows and set column alignment', async () => {
  const ws = createWorkspace();
  const file = ws.write('t.md', '| a | b |\n| - | - |\n| 1 | 2 |\n');
  const { app, page } = await launchApp(ws, [file]);
  await editor(page).getByText('2', { exact: true }).click();
  await page.waitForTimeout(150);

  const bar = page.getByRole('toolbar', { name: 'Table and code block' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Row below' }).click();
  await expect(editor(page).locator('tr')).toHaveCount(3);
  await bar.getByRole('button', { name: 'Align right' }).click();
  await expect.poll(() => ws.read('t.md')).toMatch(/\| a \| +b \|\n\| - \| -+: \|/);
  await closeApp(app);
});

test('the code language field sets the fence language', async () => {
  const ws = createWorkspace();
  const file = ws.write('c.md', '```\nlet x = 1;\n```\n');
  const { app, page } = await launchApp(ws, [file]);
  await editor(page).getByText('let x = 1;').click();
  await page.waitForTimeout(150);
  const input = page.getByRole('combobox', { name: 'Code language' });
  await input.fill('javascript');
  await input.press('Enter');
  await expect(editor(page).locator('pre .token.keyword').first()).toHaveText('let');
  await expect.poll(() => ws.read('c.md')).toBe('```javascript\nlet x = 1;\n```\n');
  await closeApp(app);
});

test('the bar is hidden outside tables and code blocks', async () => {
  const ws = createWorkspace();
  const { app, page } = await launchApp(ws, [ws.write('p.md', 'plain\n')]);
  await expect(page.getByRole('toolbar', { name: 'Table and code block' })).toBeHidden();
  await closeApp(app);
});
