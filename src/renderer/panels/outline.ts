import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

interface HeadingEntry {
  readonly level: number;
  readonly text: string;
  readonly pos: number;
}

function headingsOf(view: EditorView): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ level: Number(node.attrs['level']), text: node.textContent, pos });
      return false;
    }
    return node.isBlock;
  });
  return headings;
}

const STORAGE_KEY = 'markpad.outlineVisible';

/** The side panel that lists the document's headings. */
export class OutlinePanel {
  private view: EditorView | null = null;
  private signature = '';
  private readonly list: HTMLOListElement;

  constructor(private readonly container: HTMLElement) {
    const title = document.createElement('h2');
    title.className = 'outline-title';
    title.textContent = 'Outline';
    this.list = document.createElement('ol');
    this.list.className = 'outline-list';
    container.append(title, this.list);
    container.hidden = !readVisible();
  }

  get isVisible(): boolean {
    return !this.container.hidden;
  }

  toggle(): void {
    this.container.hidden = !this.container.hidden;
    try {
      localStorage.setItem(STORAGE_KEY, String(this.isVisible));
    } catch {
      // Storage might be unavailable; the panel still works for this session.
    }
    this.signature = '';
    this.refresh(this.view);
  }

  /** Rebuilds the list for an editor, or empties it for source view. */
  refresh(view: EditorView | null): void {
    this.view = view;
    if (!this.isVisible) return;
    const headings = view ? headingsOf(view) : [];
    const cursor = view?.state.selection.from ?? -1;
    let currentIndex = -1;
    headings.forEach((heading, i) => {
      if (heading.pos <= cursor) currentIndex = i;
    });
    const signature = JSON.stringify([headings, currentIndex]);
    if (signature === this.signature) return;
    this.signature = signature;

    if (headings.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'outline-empty';
      empty.textContent = view
        ? 'Headings appear here.'
        : 'The outline is unavailable in source view.';
      this.list.replaceChildren(empty);
      return;
    }
    const minLevel = Math.min(...headings.map((h) => h.level));
    this.list.replaceChildren(
      ...headings.map((heading, i) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'outline-item';
        button.style.paddingLeft = `${8 + (heading.level - minLevel) * 14}px`;
        button.textContent = heading.text || '(empty heading)';
        button.classList.toggle('current', i === currentIndex);
        button.dataset['level'] = String(heading.level);
        button.addEventListener('click', () => this.jumpTo(heading.pos));
        item.append(button);
        return item;
      }),
    );
  }

  private jumpTo(pos: number): void {
    const view = this.view;
    if (!view) return;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
    view.focus();
  }
}

function readVisible(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
