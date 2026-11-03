import { existsSync } from 'node:fs';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
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

/** Right-clicks a tab and clicks an item in the menu that it shows. */
async function chooseTabMenuItem(
  app: ElectronApplication,
  page: Page,
  tabLabel: string,
  item: string,
): Promise<void> {
  await app.evaluate(({ Menu }, label) => {
    Menu.prototype.popup = function (this: Electron.Menu) {
      this.items.find((entry) => entry.label === label)?.click();
    };
  }, item);
  await page.locator('#tab-bar .tab', { hasText: tabLabel }).click({ button: 'right' });
}

test('the tab menu closes groups of tabs', async () => {
  const ws = createWorkspace();
  const files = ['a', 'b', 'c', 'd', 'e'].map((name) => ws.write(`${name}.md`, `# ${name}\n`));
  const { app, page } = await launchApp(ws, files);
  const labels = page.locator('#tab-bar .tab-label');
  await expect(labels).toHaveCount(5);

  await chooseTabMenuItem(app, page, 'd.md', 'Close to the right');
  await expect(labels).toHaveText(['a.md', 'b.md', 'c.md', 'd.md']);
  await chooseTabMenuItem(app, page, 'b.md', 'Close to the left');
  await expect(labels).toHaveText(['b.md', 'c.md', 'd.md']);

  await page.locator('#tab-bar .tab', { hasText: 'c.md' }).click();
  await editor(page).click();
  await page.keyboard.type('Edited ');
  await chooseTabMenuItem(app, page, 'c.md', 'Close unchanged');
  await expect(labels).toHaveText(['c.md']);

  await chooseTabMenuItem(app, page, 'c.md', 'Close all');
  await expect(labels).toHaveText(['Untitled']);
  expect(ws.read('c.md')).toContain('Edited');
  await closeApp(app);
});

test('Close tab closes the app when no document is open', async () => {
  const ws = createWorkspace();
  const { app, page } = await launchApp(ws, [ws.write('a.md', '# A\n')]);
  await menu(app, 'close-tab');
  await expect(page.locator('#tab-bar .tab-label')).toHaveText(['Untitled']);
  const closed = app.waitForEvent('close');
  await menu(app, 'close-tab');
  await closed;
});

test('Open path opens a pasted path and reports one with no file', async () => {
  const ws = createWorkspace();
  const file = ws.write('pasted.md', '# Pasted\n');
  const { app, page } = await launchApp(ws);
  await menu(app, 'open-path');
  const input = page.locator('#open-path-input');
  await input.fill(`${ws.docs}/nope.md`);
  await input.press('Enter');
  await expect(page.locator('.open-path-error')).toContainText('nope.md');
  await input.fill(`"${file}"`);
  await input.press('Enter');
  await expect(page.locator('.open-path-dialog')).not.toBeVisible();
  await expect(editor(page).locator('h1')).toHaveText('Pasted');
  await closeApp(app);
});
