import { describe, expect, it } from 'vitest';
import { resolveImageSrc } from '../../src/renderer/editor/images';

const encoded = (path: string): string => `mdimg://local/${encodeURIComponent(path)}`;

describe('resolveImageSrc', () => {
  it('resolves a relative path against the document folder', () => {
    expect(resolveImageSrc('assets/a b.png', '/home/kai/notes/doc.md')).toBe(
      encoded('/home/kai/notes/assets/a b.png'),
    );
  });

  it('resolves parent segments and URL escapes', () => {
    expect(resolveImageSrc('../img/a%20b.png', '/home/kai/notes/doc.md')).toBe(
      encoded('/home/kai/img/a b.png'),
    );
  });

  it('keeps Windows separators', () => {
    expect(resolveImageSrc('assets/a.png', 'C:\\Users\\kai\\doc.md')).toBe(
      encoded('C:\\Users\\kai\\assets\\a.png'),
    );
  });

  it('passes web and data URLs through', () => {
    expect(resolveImageSrc('https://example.com/a.png', '/d.md')).toBe('https://example.com/a.png');
    expect(resolveImageSrc('data:image/png;base64,AA', '/d.md')).toBe('data:image/png;base64,AA');
  });

  it('serves absolute paths and file URLs through the image scheme', () => {
    expect(resolveImageSrc('/srv/a.png', '/d.md')).toBe(encoded('/srv/a.png'));
    expect(resolveImageSrc('file:///srv/a%20b.png', '/d.md')).toBe(encoded('/srv/a b.png'));
  });
});

describe('resolveLink', () => {
  it('classifies web, anchor, Markdown, and other file links', async () => {
    const { resolveLink } = await import('../../src/renderer/editor/links');
    const doc = '/home/kai/notes/doc.md';
    expect(resolveLink('https://example.com', doc)).toEqual({
      kind: 'web',
      url: 'https://example.com',
    });
    expect(resolveLink('mailto:kai@example.com', doc).kind).toBe('web');
    expect(resolveLink('#setup-steps', doc)).toEqual({ kind: 'anchor', id: 'setup-steps' });
    expect(resolveLink('../other%20note.md#part', doc)).toEqual({
      kind: 'markdown',
      path: '/home/kai/other note.md',
    });
    expect(resolveLink('files/report.pdf', doc)).toEqual({
      kind: 'file',
      path: '/home/kai/notes/files/report.pdf',
    });
    expect(resolveLink('C:\\docs\\a.md', 'C:\\docs\\b.md')).toEqual({
      kind: 'markdown',
      path: 'C:\\docs\\a.md',
    });
  });
});
