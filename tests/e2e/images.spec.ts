import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp } from './app';

// A 1x1 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

test('a relative image path loads from the document folder', async () => {
  const ws = createWorkspace();
  mkdirSync(join(ws.docs, 'pics'));
  writeFileSync(join(ws.docs, 'pics', 'red dot.png'), PNG);
  const file = ws.write('img.md', '![dot](pics/red%20dot.png)\n');
  const { app, page } = await launchApp(ws, [file]);
  const img = editor(page).locator('img[data-src]');
  await expect(img).toHaveAttribute('src', /^mdimg:/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
  await closeApp(app);
});

test('a pasted image is copied into assets and linked relatively', async () => {
  const ws = createWorkspace();
  const file = ws.write('paste.md', 'Before\n');
  const { app, page } = await launchApp(ws, [file]);
  await editor(page).getByText('Before').click();
  await page.keyboard.press('End');
  await page.waitForTimeout(150);
  await editor(page).evaluate(
    (el, bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], 'Screen Shot.png', { type: 'image/png' }));
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    },
    [...PNG],
  );

  await expect
    .poll(() => ws.read('paste.md'))
    .toMatch(/^Before!\[Screen Shot\]\(assets\/screen-shot-[0-9a-f]{8}\.png\)\n$/);
  const assets = join(ws.docs, 'assets');
  expect(existsSync(assets) && readdirSync(assets)).toHaveLength(1);
  await expect
    .poll(() =>
      editor(page)
        .locator('img[data-src]')
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBe(1);
  await closeApp(app);
});
