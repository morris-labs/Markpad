import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackupStore } from '../../src/main/backups';

describe('BackupStore', () => {
  it('moves unsaved text into files and back, and deletes unused backups', async () => {
    const root = join(mkdtempSync(join(tmpdir(), 'markpad-backups-')), 'backups');
    const store = new BackupStore(root);
    const stored = await store.store({
      activeIndex: 0,
      tabs: [
        { kind: 'file', path: '/docs/a.md', unsavedText: '# Edited\n' },
        { kind: 'draft', id: 'd1' },
      ],
    });
    expect(stored.tabs[0]).not.toHaveProperty('unsavedText');
    expect(stored.tabs[0]?.backup).toMatch(/\.md$/);
    expect((await store.load(stored)).tabs).toEqual([
      { kind: 'file', path: '/docs/a.md', unsavedText: '# Edited\n' },
      { kind: 'draft', id: 'd1' },
    ]);

    await store.store({ activeIndex: 0, tabs: [{ kind: 'file', path: '/docs/a.md' }] });
    expect(readdirSync(root)).toEqual([]);
  });
});
