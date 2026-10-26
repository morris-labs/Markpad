import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownDocument } from '../../src/renderer/editor/markdownDocument';
import { findMatches } from '../../src/renderer/editor/search';

const open: MarkdownDocument[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((doc) => doc.destroy()));
});

async function docOf(text: string) {
  const root = document.createElement('div');
  document.body.append(root);
  const doc = await MarkdownDocument.open({ root, text });
  open.push(doc);
  return doc.editor.view.state.doc;
}

function texts(doc: Awaited<ReturnType<typeof docOf>>, query: Parameters<typeof findMatches>[1]) {
  return findMatches(doc, query).map((m) => doc.textBetween(m.from, m.to));
}

describe('findMatches', () => {
  it('matches across marks within a paragraph, ignoring case by default', async () => {
    const doc = await docOf('The **Cat** sat. A cat-like cat.\n');
    expect(texts(doc, { text: 'cat', caseSensitive: false, wholeWord: false })).toEqual([
      'Cat',
      'cat',
      'cat',
    ]);
  });

  it('honors case sensitivity and whole words', async () => {
    const doc = await docOf('cat Cat concat cat_x\n');
    expect(texts(doc, { text: 'cat', caseSensitive: true, wholeWord: true })).toEqual(['cat']);
  });

  it('finds text in headings, lists, and table cells', async () => {
    const doc = await docOf('# key\n\n- key\n\n| key |\n| - |\n| key |\n');
    expect(findMatches(doc, { text: 'key', caseSensitive: false, wholeWord: false })).toHaveLength(
      4,
    );
  });

  it('treats regular expression characters literally', async () => {
    const doc = await docOf('a.b axb (x)\n');
    expect(texts(doc, { text: 'a.b', caseSensitive: false, wholeWord: false })).toEqual(['a.b']);
    expect(texts(doc, { text: '(x)', caseSensitive: false, wholeWord: false })).toEqual(['(x)']);
  });
});
