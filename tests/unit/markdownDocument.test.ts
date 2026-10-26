import { editorViewCtx } from '@milkdown/kit/core';
import { replaceAll } from '@milkdown/kit/utils';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownDocument } from '../../src/renderer/editor/markdownDocument';

const open: MarkdownDocument[] = [];

async function openText(text: string): Promise<MarkdownDocument> {
  const root = document.createElement('div');
  document.body.append(root);
  const doc = await MarkdownDocument.open({ root, text });
  open.push(doc);
  return doc;
}

/** Appends text to the end of the first text block, like a user typing. */
function typeAtEndOfFirstBlock(doc: MarkdownDocument, text: string): void {
  doc.editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const first = view.state.doc.firstChild;
    if (!first) throw new Error('The document is empty.');
    view.dispatch(view.state.tr.insertText(text, first.nodeSize - 1));
  });
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((doc) => doc.destroy()));
});

const UNCHANGED_FIXTURES: Record<string, string> = {
  'plus bullets': '+ plus\n+ two\n',
  'loose list': '- a\n\n- loose\n',
  'mixed emphasis': '_em_ and __strong__ and *em* and **strong**\n',
  'setext headings': 'Title\n=====\n\nSub\n---\n',
  'tilde fence': '~~~js\ncode\n~~~\n',
  'indented code': '    indented code\n',
  'mixed rules': '***\n\n___\n\n- - -\n',
  'paren ordered list': '1) paren\n2) two\n',
  'all-ones ordered list': '1. one\n1. one\n1. one\n',
  'wide indent': '-   wide indent\n-   two\n',
  'compact table': '| a | b |\n|---|:-:|\n| 1 | 2 |\n',
  'task list': '* [ ] task\n* [x] done\n',
  'hard breaks': 'Hard  \nbreak and back\\\nslash\n',
  'reference link': 'A [ref][1] link.\n\n[1]: https://example.com\n',
  'raw html': '<div>html</div>\n\ntext <b>inline</b>\n',
  'closed heading': '# Closed #\n',
  escapes: 'Escapes: 1\\. a_b_c * star [x]\n',
  image: '![alt](img/a.png "t")\n',
  crlf: '# Title\r\n\r\nSome text.\r\n',
  'no final newline': '# Title\n\nText',
  'extra blank lines': '# Title\n\n\n\nText\n',
  'front matter': '---\ntitle: Example\ntags: [a, b]\n---\n\n# Body\n',
  empty: '',
};

describe('MarkdownDocument round trip', () => {
  for (const [name, text] of Object.entries(UNCHANGED_FIXTURES)) {
    it(`keeps an unedited ${name} file byte for byte`, async () => {
      const doc = await openText(text);
      expect(doc.toFileText()).toBe(text);
    });
  }
});

describe('MarkdownDocument edits', () => {
  it('rewrites only the edited block', async () => {
    const text = 'Title\n=====\n\nFirst _paragraph_.\n\n~~~\ncode\n~~~\n\n- - -\n';
    const doc = await openText(text);
    typeAtEndOfFirstBlock(doc, ' more');
    expect(doc.toFileText()).toBe(
      'Title more\n==========\n\nFirst _paragraph_.\n\n~~~\ncode\n~~~\n\n- - -\n',
    );
  });

  it('writes added blocks in the file style', async () => {
    const doc = await openText('+ one\n+ two\n\n~~~\na\n~~~\n');
    doc.editor.editor.action(replaceAll('+ one\n+ two\n\n~~~\na\n~~~\n\n* three\n\n```\nb\n```\n'));
    expect(doc.toFileText()).toBe('+ one\n+ two\n\n~~~\na\n~~~\n\n+ three\n\n~~~\nb\n~~~\n');
  });

  it('keeps reference definitions when the paragraph that uses them is edited', async () => {
    const doc = await openText('A [ref][1] link.\n\n[1]: https://example.com\n');
    typeAtEndOfFirstBlock(doc, ' Edited.');
    expect(doc.toFileText()).toContain('[1]: https://example.com');
  });

  it('keeps unedited front matter and its gap', async () => {
    const doc = await openText('---\na: 1\n---\n\n\nText\n');
    typeAtEndOfFirstBlock(doc, '!');
    expect(doc.toFileText()).toBe('---\na: 1\n---\n\n\nText!\n');
  });

  it('writes edited front matter', async () => {
    const doc = await openText('Text\n');
    doc.frontMatter = 'title: Example';
    expect(doc.toFileText()).toBe('---\ntitle: Example\n---\n\nText\n');
  });

  it('keeps CRLF line endings after an edit', async () => {
    const doc = await openText('# Title\r\n\r\nText\r\n');
    typeAtEndOfFirstBlock(doc, '!');
    expect(doc.toFileText()).toBe('# Title!\r\n\r\nText\r\n');
  });
});

describe('MarkdownDocument with many blocks', () => {
  it('keeps every unedited block when one block in a long file changes', async () => {
    const blocks = Array.from({ length: 400 }, (_, i) =>
      i % 3 === 0 ? `_para_ ${i}` : i % 3 === 1 ? `* item ${i}` : `Head ${i}\n--------`,
    );
    const text = `${blocks.join('\n\n')}\n`;
    const doc = await openText(text);
    typeAtEndOfFirstBlock(doc, '!');
    expect(doc.toFileText()).toBe(text.replace('_para_ 0', '_para_ 0!'));
  });
});
