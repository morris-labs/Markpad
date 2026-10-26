import type { EditorView } from '@milkdown/kit/prose/view';
import { applyLink, linkAtSelection } from '../editor/links';

/** Actions that the link bubble asks the app to perform. */
export interface LinkBubbleHost {
  readonly openLink: (href: string) => void;
  readonly editLink: (anchor: HTMLElement) => void;
}

const isMac = navigator.userAgent.includes('Mac');

/** A small bar under the link at the cursor, with its address and actions. */
export class LinkBubble {
  private readonly element: HTMLElement;
  private readonly address: HTMLAnchorElement;
  private view: EditorView | null = null;
  private href = '';

  constructor(private readonly host: LinkBubbleHost) {
    this.element = document.createElement('div');
    this.element.className = 'link-bubble';
    this.element.hidden = true;
    this.element.addEventListener('mousedown', (event) => event.preventDefault());

    this.address = document.createElement('a');
    this.address.className = 'link-address';
    this.address.title = `Open link (${isMac ? 'Cmd' : 'Ctrl'}+click in the text)`;
    this.address.addEventListener('click', (event) => {
      event.preventDefault();
      host.openLink(this.href);
    });
    const edit = this.button('Edit', () => host.editLink(this.element));
    const remove = this.button('Remove', () => {
      if (this.view) applyLink(this.view, '');
    });
    this.element.append(this.address, edit, remove);
    document.body.append(this.element);
  }

  /** Shows the bubble for the link at the cursor, or hides it. */
  refresh(view: EditorView | null): void {
    this.view = view;
    const link = view && view.state.selection.empty ? linkAtSelection(view.state) : null;
    const href = typeof link?.attrs['href'] === 'string' ? link.attrs['href'] : '';
    if (!view || !link || !view.hasFocus()) {
      this.element.hidden = true;
      return;
    }
    this.href = href;
    this.address.textContent = href || '(no address)';
    this.address.href = href;
    const start = view.coordsAtPos(link.from);
    this.element.hidden = false;
    const width = this.element.offsetWidth;
    this.element.style.left = `${Math.max(8, Math.min(start.left, window.innerWidth - width - 8))}px`;
    this.element.style.top = `${start.bottom + 6}px`;
  }

  hide(): void {
    this.element.hidden = true;
  }

  private button(label: string, run: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', run);
    return button;
  }
}
