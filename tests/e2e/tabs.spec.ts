import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp, menu } from './app';

test('files open in tabs, and the session comes back on relaunch', async () => {
  const ws = createWorkspace();
  const a = ws.write('a.md', '# A\n');
  const b = ws.write('b.md', '# B\n');
  let { app, page } = await launchApp(ws, [a, b]);

  const tabs = page.locator('#tab-bar .tab');
  await expect(tabs).toHaveCount(2);
  await expect(editor(page).locator('h1')).toHaveText('B');

  await tabs.first().click();
  await expect(editor(page).locator('h1')).toHaveText('A');

  // An untitled draft keeps its text across a restart.
  await menu(app, 'new');
  await expect(tabs).toHaveCount(3);
  await editor(page).click();
  await page.keyboard.type('Draft text');
  await closeApp(app);

  ({ app, page } = await launchApp(ws));
  await expect(page.locator('#tab-bar .tab-label')).toHaveText(['a.md', 'b.md', 'Untitled']);
  await expect(editor(page)).toHaveText('Draft text');
  await closeApp(app);
});

test('an outside change reloads a tab with no pending edits', async () => {
  const ws = createWorkspace();
  const file = ws.write('watched.md', '# Before\n');
  const { app, page } = await launchApp(ws, [file]);
  await expect(editor(page).locator('h1')).toHaveText('Before');
  ws.write('watched.md', '# After\n');
  await expect(editor(page).locator('h1')).toHaveText('After');
  await closeApp(app);
});

test('a missing file named on the command line opens empty and is created on first edit', async () => {
  const ws = createWorkspace();
  const path = `${ws.docs}/fresh.md`;
  const { app, page } = await launchApp(ws, [path]);
  await expect(page.locator('#tab-bar .tab-label')).toHaveText(['fresh.md']);
  await page.waitForTimeout(1500);
  expect(() => ws.read('fresh.md')).toThrow();
  await editor(page).click();
  await page.keyboard.type('Created');
  // Polling stops on a thrown error, so read only once the file exists.
  await expect.poll(() => (existsSync(path) ? ws.read('fresh.md') : null)).toBe('Created\n');
  await closeApp(app);
});
