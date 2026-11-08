import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Session, SessionTab } from '@shared/api';
import { writeFileAtomic } from './fileStore';

/**
 * Keeps edits that couldn't be saved, so they survive a restart.
 *
 * The session stores a backup file name in place of each tab's unsaved text,
 * and the text itself goes in its own file in the backups folder.
 */
export class BackupStore {
  constructor(private readonly root: string) {}

  /** Writes each tab's unsaved text to a backup file and deletes backups no tab uses. */
  async store(session: Session): Promise<Session> {
    const tabs: SessionTab[] = [];
    for (const tab of session.tabs) {
      const { unsavedText, ...rest } = tab;
      delete rest.backup; // Each store writes fresh backup names.
      if (unsavedText === undefined) {
        tabs.push(rest as SessionTab);
        continue;
      }
      const backup = `${createHash('sha256').update(tabKey(tab)).digest('hex').slice(0, 32)}.md`;
      await writeFileAtomic(join(this.root, backup), unsavedText);
      tabs.push({ ...rest, backup } as SessionTab);
    }
    await this.prune(new Set(tabs.flatMap((tab) => (tab.backup ? [tab.backup] : []))));
    return { ...session, tabs };
  }

  /** Reads the unsaved text of each tab that has a backup. */
  async load(session: Session): Promise<Session> {
    const tabs = await Promise.all(
      session.tabs.map(async (tab) => {
        if (!tab.backup) return tab;
        const { backup, ...rest } = tab;
        try {
          return {
            ...rest,
            unsavedText: await readFile(join(this.root, backup), 'utf8'),
          } as SessionTab;
        } catch {
          return rest as SessionTab; // The backup is gone; the file on disk is all there is.
        }
      }),
    );
    return { ...session, tabs };
  }

  private async prune(keep: ReadonlySet<string>): Promise<void> {
    const names = await readdir(this.root).catch(() => [] as string[]);
    for (const name of names) {
      if (!keep.has(name)) await rm(join(this.root, name), { force: true });
    }
  }
}

function tabKey(tab: SessionTab): string {
  return tab.kind === 'file' ? `file:${tab.path}` : `draft:${tab.id}`;
}
