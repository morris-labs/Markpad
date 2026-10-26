import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { createWorkspace } from './app';

const BINARY = join(import.meta.dirname, '../../dist/linux-unpacked/markpad');

// Runs only after `npm run dist:linux`, and only where no package installed /usr/bin/mdv.
test('Help > Install mdv command writes a launcher to ~/.local/bin', async () => {
  test.skip(!existsSync(BINARY) || existsSync('/usr/bin/mdv'), 'Needs the unpacked build.');
  const ws = createWorkspace();
  const home = mkdtempSync(join(tmpdir(), 'markpad-home-'));
  const app = await electron.launch({
    executablePath: BINARY,
    args: [`--user-data-dir=${ws.userData}`],
    env: { ...process.env, HOME: home },
  });
  await app.firstWindow();

  const clickHelpItem = (label: string) =>
    app.evaluate(async ({ dialog, Menu }, itemLabel) => {
      let shown = '';
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const options = args.at(-1) as { message: string; detail: string };
        shown = `${options.message} ${options.detail}`;
        return { response: 0, checkboxChecked: false };
      }) as never;
      const help = Menu.getApplicationMenu()?.items.find((item) => item.role === 'help');
      help?.submenu?.items.find((item) => item.label === itemLabel)?.click();
      for (let i = 0; i < 50 && !shown; i++) await new Promise((r) => setTimeout(r, 100));
      return shown;
    }, label);

  const installed = await clickHelpItem("Install 'mdv' command");
  expect(installed).toContain("The 'mdv' command is installed.");
  const script = join(home, '.local', 'bin', 'mdv');
  expect(statSync(script).mode & 0o111).not.toBe(0);
  expect(readFileSync(script, 'utf8')).toContain(`DEFAULT_APP='${BINARY}'`);

  const removed = await clickHelpItem("Remove 'mdv' command");
  expect(removed).toContain("The 'mdv' command is removed.");
  expect(existsSync(script)).toBe(false);
  await app.close();
});
