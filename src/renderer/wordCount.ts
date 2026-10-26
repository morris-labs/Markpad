const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

/** Counts words with the locale's word rules, so text without spaces counts too. */
export function countWords(text: string): number {
  let count = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) count++;
  }
  return count;
}

/** Formats a word count for the status bar, with the selection's count when there is one. */
export function formatWordCount(total: number, selected: number): string {
  const words = (n: number): string => `${n.toLocaleString()} ${n === 1 ? 'word' : 'words'}`;
  return selected > 0 ? `${selected.toLocaleString()} of ${words(total)}` : words(total);
}
