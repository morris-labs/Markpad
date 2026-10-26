import { existsSync, statSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';

/** File system checks, injectable for tests. */
export interface PathChecks {
  readonly isDirectory: (path: string) => boolean;
  readonly exists: (path: string) => boolean;
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
