import { describe, expect, it } from 'vitest';
import { MarkdownDocument } from '../../src/renderer/editor/markdownDocument';
import { FindBar } from '../../src/renderer/panels/findBar';

async function open(text: string) {
  const root = document.createElement('div');
  document.body.append(root);
  return MarkdownDocument.open({ root, text });
}

describe('FindBar.attach', () => {
  it('moves to a new view after the old view is destroyed', async () => {
    const bar = new FindBar(document.body);
    const first = await open('one cat\n');
    bar.open(first.editor.view, false);
    await first.destroy();
    const second = await open('two cats\n');
    expect(() => bar.attach(second.editor.view)).not.toThrow();
    expect((bar as unknown as { view: unknown }).view).toBe(second.editor.view);
    await second.destroy();
  });

  it('ignores handlers and closes cleanly after the view is destroyed', async () => {
    const bar = new FindBar(document.body);
    const doc = await open('one cat\n');
    bar.open(doc.editor.view, true);
    await doc.destroy();
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.find-bar button'));
    expect(() => buttons.forEach((button) => button.click())).not.toThrow();
    expect(() => bar.updateCount()).not.toThrow();
    expect(bar.isOpen).toBe(false);
  });

  it('closes without throwing when attached to null after destroy', async () => {
    const bar = new FindBar(document.body);
    const doc = await open('one cat\n');
    bar.open(doc.editor.view, false);
    await doc.destroy();
    expect(() => bar.attach(null)).not.toThrow();
    expect(bar.isOpen).toBe(false);
  });
});
