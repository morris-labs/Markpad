// @vitest-environment node
import { lstatSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomic } from '../../src/main/fileStore';

describe('writeFileAtomic', () => {
  it('saves through a symlink and keeps the link', async () => {
    const root = mkdtempSync(join(tmpdir(), 'markpad-store-'));
    const real = join(root, 'real.md');
    const link = join(root, 'link.md');
    writeFileSync(real, 'old\n');
    symlinkSync(real, link);
    await writeFileAtomic(link, 'new\n');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(real, 'utf8')).toBe('new\n');
  });

  it('keeps the permissions of the file it replaces', async () => {
    const root = mkdtempSync(join(tmpdir(), 'markpad-store-'));
    const file = join(root, 'script.md');
    writeFileSync(file, 'old\n');
    await chmod(file, 0o640);
    await writeFileAtomic(file, 'new\n');
    expect(statSync(file).mode & 0o777).toBe(0o640);
  });

  it('creates a missing file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'markpad-store-'));
    const file = join(root, 'sub', 'fresh.md');
    await writeFileAtomic(file, 'hi\n');
    expect(readFileSync(file, 'utf8')).toBe('hi\n');
  });
});
