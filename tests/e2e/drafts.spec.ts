import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp, menu } from './app';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

test('Save as moves a draft and its images to a real file', async () => {
  const ws = createWorkspace();
  const { app, page } = await launchApp(ws);
  await expect(page.locator('#tab-bar .tab-label')).toHaveText(['Untitled']);

  await editor(page).click();
  await page.keyboard.type('# Plan');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await editor(page).evaluate(
    (el, bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], 'chart.png', { type: 'image/png' }));
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    },
    [...PNG],
  );
  await expect(editor(page).locator('img[data-src]')).toHaveCount(1);
  await expect(page.locator('#tab-bar .tab-label')).toHaveText(['Plan']);

  const target = join(ws.docs, 'plan.md');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never;
  }, target);
  await menu(app, 'save-as');
  await expect(page.locator('#tab-bar .tab-label')).toHaveText(['plan.md']);

  expect(ws.read('plan.md')).toMatch(/^# Plan\n\n!\[chart\]\(assets\/chart-[0-9a-f]{8}\.png\)\n$/);
  expect(readdirSync(join(ws.docs, 'assets'))).toHaveLength(1);
  expect(
    existsSync(join(ws.userData, 'drafts')) && readdirSync(join(ws.userData, 'drafts')),
  ).toEqual([]);
  await expect
    .poll(() =>
      editor(page)
        .locator('img[data-src]')
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBe(1);
  await closeApp(app);
});

test('closing a draft with text asks first, and Delete discards it', async () => {
  const ws = createWorkspace();
  const { app, page } = await launchApp(ws);
  await editor(page).click();
  await page.keyboard.type('Scratch notes');
  await app.evaluate(({ dialog }) => {
    // Choose "Delete", the second button.
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as never;
  });
  await menu(app, 'close-tab');
  await expect(editor(page)).toHaveText('');
  await expect(page.locator('#tab-bar .tab')).toHaveCount(1);
  await closeApp(app);
});
