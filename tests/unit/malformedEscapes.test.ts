import { describe, expect, it } from 'vitest';
import { resolveImageSrc } from '../../src/renderer/editor/images';
import { resolveLink } from '../../src/renderer/editor/links';

describe('malformed percent escapes', () => {
  it('resolveLink keeps a malformed anchor as is', () => {
    expect(resolveLink('#a%zz', '/d/x.md')).toEqual({ kind: 'anchor', id: 'a%zz' });
  });

  it('resolveLink handles a malformed file URL', () => {
    expect(resolveLink('file:///a%zz.md', '/d/x.md')).toEqual({
      kind: 'markdown',
      path: '/a%zz.md',
    });
  });

  it('resolveImageSrc handles a malformed file URL', () => {
    expect(resolveImageSrc('file:///a%zz.png', '/d/x.md')).toBe(
      `mdimg://local/${encodeURIComponent('/a%zz.png')}`,
    );
  });
});
