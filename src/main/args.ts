import { existsSync, statSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** File system checks, injectable for tests. */
export interface PathChecks {
  readonly isDirectory: (path: string) => boolean;
  readonly exists: (path: string) => boolean;
}

/** The result of {@link resolvePastedPaths}. */
export interface PastedPaths {
  readonly found: readonly string[];
  readonly notFound: readonly string[];
}

const fsChecks: PathChecks = {
  isDirectory: (path) => existsSync(path) && statSync(path).isDirectory(),
  exists: existsSync,
};

/**
 * Gets the files to open from command-line arguments.
 *
 * Arguments that start with `-` are switches, unless they follow `--`.
 * Relative paths resolve against `cwd`. A path that doesn't exist is kept,
 * so it opens as an empty document, when its folder exists. Folders are
 * skipped.
 *
 * @param args The arguments after the executable (and, in development, the app path).
 * @param cwd The working folder of the process that received the arguments.
 */
export function parseFileArgs(
  args: readonly string[],
  cwd: string,
  checks: PathChecks = fsChecks,
): string[] {
  const files: string[] = [];
  let afterSeparator = false;
  for (const arg of args) {
    if (!afterSeparator && arg === '--') {
      afterSeparator = true;
      continue;
    }
    if (!afterSeparator && (arg.startsWith('-') || arg === '.')) continue;
    const path = resolve(cwd, arg);
    if (checks.isDirectory(path)) continue;
    if (!checks.exists(path) && !checks.isDirectory(dirname(path))) continue;
    if (!files.includes(path)) files.push(path);
  }
  return files;
}

/**
 * Finds the files named in text that the user pasted, one path per line.
 *
 * Each line can have surrounding quotation marks, a `~` prefix, backslash-escaped
 * spaces, or a `file:` URL. Relative paths resolve against `baseFolder`.
 *
 * @returns The existing files, and the lines that don't name a file.
 */
export function resolvePastedPaths(
  text: string,
  baseFolder: string,
  home: string,
  checks: PathChecks = fsChecks,
  isWindows = process.platform === 'win32',
): PastedPaths {
  const found: string[] = [];
  const notFound: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const path = pastedLineToPath(trimmed, baseFolder, home, isWindows);
    if (path === null || !checks.exists(path) || checks.isDirectory(path)) notFound.push(trimmed);
    else if (!found.includes(path)) found.push(path);
  }
  return { found, notFound };
}

function pastedLineToPath(
  line: string,
  baseFolder: string,
  home: string,
  isWindows: boolean,
): string | null {
  let path = line.replace(/^(['"])(.*)\1$/, '$2');
  if (/^file:/i.test(path)) {
    try {
      return fileURLToPath(path);
    } catch {
      return null;
    }
  }
  if (!isWindows) path = path.replace(/\\ /g, ' ');
  if (path === '~') return home;
  if (path.startsWith('~/') || path.startsWith('~\\')) path = `${home}/${path.slice(2)}`;
  return resolve(baseFolder, path);
}

/** Adds or removes a folder in a PATH value, comparing entries without case on Windows. */
export function editPathList(
  pathValue: string,
  folder: string,
  add: boolean,
  separator = delimiter,
  ignoreCase = process.platform === 'win32',
): string {
  const same = (a: string): boolean =>
    ignoreCase ? a.toLowerCase() === folder.toLowerCase() : a === folder;
  const entries = pathValue.split(separator).filter((entry) => entry !== '' && !same(entry));
  if (add) entries.push(folder);
  return entries.join(separator);
}
