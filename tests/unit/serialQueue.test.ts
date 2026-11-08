import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackupStore } from '../../src/main/backups';
import { DraftStore } from '../../src/main/drafts';
import { SerialQueue } from '../../src/main/serialQueue';

describe('SerialQueue', () => {
  it('runs tasks in order and continues after a failure', async () => {
    const queue = new SerialQueue();
    const order: number[] = [];
    const slow = queue.run(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
      throw new Error('boom');
    });
    const fast = queue.run(async () => {
      order.push(2);
    });
    await expect(slow).rejects.toThrow('boom');
    await fast;
    expect(order).toEqual([1, 2]);
  });
});

describe('concurrent stores', () => {
  it('keeps every backup when stores overlap', async () => {
    const root = join(mkdtempSync(join(tmpdir(), 'markpad-conc-')), 'backups');
    const store = new BackupStore(root);
    const session = (text: string) => ({
      activeIndex: 0,
      tabs: [{ kind: 'file' as const, path: '/docs/a.md', unsavedText: text }],
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => store.store(session(`v${i}`))),
    );
    const last = results[7]!;
    expect(readFileSync(join(root, last.tabs[0]!.backup!), 'utf8')).toBe('v7');
  });
});

describe('DraftStore.pruneEmpty', () => {
  it('keeps an empty draft created by this process that a stale save omits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'markpad-drafts-'));
    const drafts = new DraftStore(root);
    const draft = await drafts.create();
    await drafts.pruneEmpty(new Set());
    expect((await drafts.read(draft.id)).text).toBe('');
  });
});
