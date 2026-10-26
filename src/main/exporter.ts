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
 * Renders exported HTML in a hidden window and prints it to a PDF file.
 *
 * The page loads from a temporary file, because large embedded images can
 * exceed the length limit of a data URL.
 */
export async function exportPdf(path: string, html: string): Promise<void> {
  const temp = join(tmpdir(), `markpad-export-${randomUUID()}.html`);
  await writeFile(temp, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  try {
    await win.loadFile(temp);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: defaultPageSize(),
      preferCSSPageSize: true,
    });
    await writeFileAtomic(path, pdf);
  } finally {
    win.destroy();
    await rm(temp, { force: true });
  }
}
