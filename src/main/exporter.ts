import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { writeFileAtomic } from './fileStore';

/** Gets the page size that people in the user's locale expect. */
function defaultPageSize(): 'Letter' | 'A4' {
  return /^(en-US|en-CA|es-MX|fr-CA)$/i.test(app.getLocale()) ? 'Letter' : 'A4';
}

/** Writes exported HTML to a file. */
export async function exportHtml(path: string, html: string): Promise<void> {
  await writeFileAtomic(path, html);
}

/**
 * Loads exported HTML in a hidden window, runs `use` on the window, and then
 * closes it.
 *
 * The page loads from a temporary file, because large embedded images can
 * exceed the length limit of a data URL.
 */
async function withRenderedPage<T>(
  html: string,
  use: (win: BrowserWindow) => Promise<T>,
): Promise<T> {
  const temp = join(tmpdir(), `markpad-export-${randomUUID()}.html`);
  await writeFile(temp, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  try {
    await win.loadFile(temp);
    return await use(win);
  } finally {
    win.destroy();
    await rm(temp, { force: true });
  }
}

/** Renders exported HTML in a hidden window and prints it to a PDF file. */
export async function exportPdf(path: string, html: string): Promise<void> {
  await withRenderedPage(html, async (win) => {
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: defaultPageSize(),
      preferCSSPageSize: true,
    });
    await writeFileAtomic(path, pdf);
  });
}

/**
 * Renders exported HTML in a hidden window and shows the system print dialog.
 *
 * @returns True if the page was sent to a printer; false if the user canceled.
 */
export async function printHtml(html: string): Promise<boolean> {
  return withRenderedPage(
    html,
    (win) =>
      new Promise<boolean>((resolve, reject) => {
        win.webContents.print({ printBackground: true }, (success, failureReason) => {
          if (success) resolve(true);
          else if (/cancel/i.test(failureReason)) resolve(false);
          else reject(new Error(failureReason));
        });
      }),
  );
}
