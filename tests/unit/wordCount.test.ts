import { describe, expect, it } from 'vitest';
import { countWords, formatWordCount } from '../../src/renderer/wordCount';

describe('countWords', () => {
  it('counts words and ignores punctuation', () => {
    expect(countWords("Hello, world! It's a test - really.")).toBe(6);
  });

  it('returns zero for empty or blank text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  \n ')).toBe(0);
  });
});

describe('formatWordCount', () => {
  it('uses the singular for one word and shows the selection', () => {
    expect(formatWordCount(1, 0)).toBe('1 word');
    expect(formatWordCount(1200, 3)).toMatch(/^3 of 1.200 words$/);
  });
});
