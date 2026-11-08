import { randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, extname, join, basename } from 'node:path';
import type { DraftSnapshot } from '@shared/api';
import { readText, writeFileAtomic } from './fileStore';

const DRAFT_FILE = 'draft.md';
export const ASSETS_DIR = 'assets';

/** Stores untitled documents in per-draft folders under the app's data folder. */
export class DraftStore {
  /** Drafts created by this process; a save with an older tab list can't know them. */
  private readonly created = new Set<string>();

  constructor(private readonly root: string) {}

  /** Gets the folder that holds a draft's Markdown file and assets. */
  folder(id: string): string {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`Invalid draft ID: ${id}`);
    return join(this.root, id);
  }

  pathOf(id: string): string {
    return join(this.folder(id), DRAFT_FILE);
  }

  /** Checks whether a path is the Markdown file of a draft. */
  isDraftPath(path: string): boolean {
    return dirname(dirname(path)) === this.root && basename(path) === DRAFT_FILE;
  }

  async create(): Promise<DraftSnapshot> {
    const id = randomUUID();
    this.created.add(id);
    await mkdir(this.folder(id), { recursive: true });
    await writeFileAtomic(this.pathOf(id), '');
    return { id, path: this.pathOf(id), text: '' };
  }

  async read(id: string): Promise<DraftSnapshot> {
    return { id, path: this.pathOf(id), text: await readText(this.pathOf(id)) };
  }

  async delete(id: string): Promise<void> {
    this.created.delete(id);
    await rm(this.folder(id), { recursive: true, force: true });
  }

  /**
   * Writes a draft to a real file and moves its assets alongside it.
   *
   * Asset names are unique per paste, so an asset that already exists in the
   * target folder is left as is.
   */
  async promote(id: string, target: string, text: string): Promise<void> {
    const assets = join(this.folder(id), ASSETS_DIR);
    const names = await readdir(assets).catch(() => [] as string[]);
    if (names.length > 0) {
      const targetAssets = join(dirname(target), ASSETS_DIR);
      await mkdir(targetAssets, { recursive: true });
      for (const name of names) {
        const destination = join(targetAssets, name);
        const exists = await stat(destination).then(
          () => true,
          () => false,
        );
        if (!exists) await cp(join(assets, name), destination);
      }
    }
    await writeFileAtomic(target, text);
    await this.delete(id);
  }

  /** Deletes drafts that no session tab refers to and that are empty. */
  async pruneEmpty(keep: ReadonlySet<string>): Promise<void> {
    const ids = await readdir(this.root).catch(() => [] as string[]);
    for (const id of ids) {
      if (keep.has(id) || this.created.has(id) || extname(id) !== '') continue;
      const text = await readText(join(this.root, id, DRAFT_FILE)).catch(() => '');
      if (text.trim() === '') await rm(join(this.root, id), { recursive: true, force: true });
    }
  }
}
