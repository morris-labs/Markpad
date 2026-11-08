import { describe, expect, it } from 'vitest';
import {
  editPathList,
  parseFileArgs,
  resolvePastedPaths,
  type PathChecks,
} from '../../src/main/args';

const files = new Set(['/work/notes.md', '/work/-dash.md', '/work/sub/a.md']);
const folders = new Set(['/', '/work', '/work/sub']);
const checks: PathChecks = {
  isDirectory: (path) => folders.has(path),
  exists: (path) => files.has(path) || folders.has(path),
};

describe('parseFileArgs', () => {
  it('resolves relative paths and skips switches', () => {
    expect(parseFileArgs(['--user-data-dir=/x', 'notes.md', 'sub/a.md'], '/work', checks)).toEqual([
      '/work/notes.md',
      '/work/sub/a.md',
    ]);
  });

  it('keeps a missing file in an existing folder, so it opens as a new document', () => {
    expect(parseFileArgs(['todo.md', 'nowhere/todo.md'], '/work', checks)).toEqual([
      '/work/todo.md',
    ]);
  });

  it('treats every argument after -- as a file and skips folders', () => {
    expect(parseFileArgs(['--', '-dash.md', 'sub', '.'], '/work', checks)).toEqual([
      '/work/-dash.md',
    ]);
  });

  it('drops duplicates', () => {
    expect(parseFileArgs(['notes.md', '/work/notes.md'], '/work', checks)).toEqual([
      '/work/notes.md',
    ]);
  });
});

describe('editPathList', () => {
  it('adds a folder once and removes it again', () => {
    const added = editPathList('C:\\A;C:\\B', 'C:\\Users\\kai\\bin', true, ';', true);
    expect(added).toBe('C:\\A;C:\\B;C:\\Users\\kai\\bin');
    expect(editPathList(added, 'c:\\users\\KAI\\bin', true, ';', true)).toBe(
      'C:\\A;C:\\B;c:\\users\\KAI\\bin',
    );
    expect(editPathList(added, 'C:\\USERS\\kai\\BIN', false, ';', true)).toBe('C:\\A;C:\\B');
  });

  it('drops empty entries and compares with case on POSIX', () => {
    expect(editPathList('/a::/B', '/b', true, ':', false)).toBe('/a:/B:/b');
  });
});

describe('resolvePastedPaths', () => {
  const files = new Set(['/home/alex/a b.md', '/docs/c.md']);
  const checks = {
    exists: (path: string) => files.has(path) || path === '/docs',
    isDirectory: (path: string) => path === '/docs',
  };
  const resolvePasted = (text: string) =>
    resolvePastedPaths(text, '/docs', '/home/alex', checks, false);

  it.each([
    ['/docs/c.md', '/docs/c.md'],
    ['  "/docs/c.md"  ', '/docs/c.md'],
    ["'/docs/c.md'", '/docs/c.md'],
    ['c.md', '/docs/c.md'],
    ['file:///docs/c.md', '/docs/c.md'],
    ['~/a b.md', '/home/alex/a b.md'],
    ['~/a\\ b.md', '/home/alex/a b.md'],
  ])('finds the file in %s', (text, path) => {
    expect(resolvePasted(text)).toEqual({ found: [path], notFound: [] });
  });

  it('handles several lines and reports the ones without a file', () => {
    expect(resolvePasted('/docs/c.md\r\n\r\n/docs\n/docs/c.md\nnope.md')).toEqual({
      found: ['/docs/c.md'],
      notFound: ['/docs', 'nope.md'],
    });
  });
});
