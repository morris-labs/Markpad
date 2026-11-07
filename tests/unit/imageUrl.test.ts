import { describe, expect, it } from 'vitest';
import { imagePathFromUrl } from '../../src/main/imageUrl';

describe('imagePathFromUrl', () => {
  it('decodes an encoded path', () => {
    expect(imagePathFromUrl(`mdimg://local/${encodeURIComponent('/a b/c.png')}`)).toBe(
      '/a b/c.png',
    );
  });

  it('returns null for a malformed percent escape', () => {
    expect(imagePathFromUrl('mdimg://local/a%zz.png')).toBeNull();
  });
});
