import { randomUUID } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** Writes a file through a temporary file and a rename, so readers never see a partial file. */
export async function writeFileAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, text, 'utf8');
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

const CHANGE_DEBOUNCE_MS = 150;

/**
 * Watches open files and reports changes that this app didn't write.
 *
 * Each file's directory is watched instead of the file itself, because many
 * editors save by replacing the file, which ends a watch on the old file.
 */
export class FileWatcher {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly lastWritten = new Map<string, string>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly onChange: (path: string, text: string) => void) {}

  watch(path: string): void {
    if (this.watchers.has(path)) return;
    try {
      const watcher = watch(dirname(path), (_event, name) => {
        if (name === null || name.toString() === basename(path)) this.schedule(path);
      });
      watcher.on('error', () => this.unwatch(path));
      this.watchers.set(path, watcher);
    } catch {
      // The directory might not exist or might not support watching.
    }
  }

  unwatch(path: string): void {
    this.watchers.get(path)?.close();
    this.watchers.delete(path);
    this.lastWritten.delete(path);
    clearTimeout(this.timers.get(path));
    this.timers.delete(path);
  }

  /** Records text that the app wrote, so the change it causes isn't reported. */
  noteWrite(path: string, text: string): void {
    this.lastWritten.set(path, text);
  }

  closeAll(): void {
    for (const path of [...this.watchers.keys()]) this.unwatch(path);
  }

  private schedule(path: string): void {
    clearTimeout(this.timers.get(path));
    this.timers.set(
      path,
      setTimeout(() => void this.check(path), CHANGE_DEBOUNCE_MS),
    );
  }

  private async check(path: string): Promise<void> {
    let text: string;
    try {
      text = await readText(path);
    } catch {
      return; // Deleted or mid-replace; a later event reports the final state.
    }
    if (text === this.lastWritten.get(path)) return;
    this.lastWritten.set(path, text);
    this.onChange(path, text);
  }
}
