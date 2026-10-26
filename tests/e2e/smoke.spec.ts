import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from './app';

test('the app opens a window titled Markpad', async () => {
  const app = await launchApp(mkdtempSync(join(tmpdir(), 'markpad-')));
  const win = await app.firstWindow();
  await expect(win).toHaveTitle(/Markpad/);
  await app.close();
});
