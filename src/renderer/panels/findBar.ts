import type { EditorView } from '@milkdown/kit/prose/view';
import {
  clearSearch,
  findNext,
  replaceAll,
  replaceCurrent,
  searchStatus,
  setSearchQuery,
  type SearchQuery,
} from '../editor/search';

/** The find and replace bar for the styled view. */
export class FindBar {
  private readonly element: HTMLElement;
  private readonly findInput: HTMLInputElement;
  private readonly replaceInput: HTMLInputElement;
  private readonly replaceRow: HTMLElement;
  private readonly count: HTMLElement;
  private readonly caseToggle: HTMLButtonElement;
  private readonly wordToggle: HTMLButtonElement;
  private view: EditorView | null = null;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'find-bar';
    this.element.hidden = true;
    this.element.setAttribute('role', 'search');

    this.findInput = this.input('Find');
    this.count = document.createElement('span');
    this.count.className = 'find-count';
    this.caseToggle = this.toggle('Aa', 'Match case');
    this.wordToggle = this.toggle('W', 'Whole word');
    const previous = this.button('↑', 'Previous match (Shift+Enter)', () => this.step(-1));
    const next = this.button('↓', 'Next match (Enter)', () => this.step(1));
    const close = this.button('×', 'Close (Escape)', () => this.close());
    const findRow = document.createElement('div');
    findRow.className = 'find-row';
    findRow.append(
      this.findInput,
      this.count,
      this.caseToggle,
      this.wordToggle,
      previous,
      next,
      close,
    );

    this.replaceInput = this.input('Replace');
    const replaceOne = this.button('Replace', 'Replace this match', () => {
      if (this.view) replaceCurrent(this.view, this.replaceInput.value);
      this.updateCount();
    });
    const replaceEvery = this.button('All', 'Replace all matches', () => {
      if (this.view) replaceAll(this.view, this.replaceInput.value);
      this.updateCount();
    });
    replaceOne.classList.add('text-button');
    replaceEvery.classList.add('text-button');
    this.replaceRow = document.createElement('div');
    this.replaceRow.className = 'find-row';
    this.replaceRow.append(this.replaceInput, replaceOne, replaceEvery);

    this.element.append(findRow, this.replaceRow);
    container.append(this.element);

    this.findInput.addEventListener('input', () => this.search());
    this.findInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.step(event.shiftKey ? -1 : 1);
      }
    });
    this.replaceInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        replaceOne.click();
      }
    });
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** Opens the bar for an editor, with the selected text as the query. */
  open(view: EditorView, withReplace: boolean): void {
    this.view = view;
    this.element.hidden = false;
    this.replaceRow.hidden = !withReplace;
    const { from, to } = view.state.selection;
    const selected = view.state.doc.textBetween(from, to, ' ');
    if (selected && !selected.includes('\n') && selected.length < 200) {
      this.findInput.value = selected;
    }
    this.search();
    this.findInput.focus();
    this.findInput.select();
  }

  /** Points the open bar at another editor, as when the active tab changes. */
  attach(view: EditorView | null): void {
    if (!this.isOpen || view === this.view) return;
    if (this.view) clearSearch(this.view);
    this.view = view;
    if (view) this.search();
    else this.close();
  }

  close(): void {
    if (this.view) {
      clearSearch(this.view);
      this.view.focus();
    }
    this.element.hidden = true;
  }

  /** Updates the match count after the document changes. */
  updateCount(): void {
    if (!this.view || !this.isOpen) return;
    const { count, index } = searchStatus(this.view.state);
    this.count.textContent =
      this.findInput.value === '' ? '' : count === 0 ? 'No results' : `${index} of ${count}`;
  }

  private query(): SearchQuery {
    return {
      text: this.findInput.value,
      caseSensitive: this.caseToggle.getAttribute('aria-pressed') === 'true',
      wholeWord: this.wordToggle.getAttribute('aria-pressed') === 'true',
    };
  }

  private search(): void {
    if (!this.view) return;
    setSearchQuery(this.view, this.query());
    this.updateCount();
  }

  private step(direction: 1 | -1): void {
    if (!this.view) return;
    findNext(this.view, direction);
    this.updateCount();
  }

  private input(label: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = label;
    input.spellcheck = false;
    input.setAttribute('aria-label', label);
    return input;
  }

  private button(text: string, label: string, run: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', run);
    return button;
  }

  private toggle(text: string, label: string): HTMLButtonElement {
    const button = this.button(text, label, () => {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!pressed));
      this.search();
    });
    button.setAttribute('aria-pressed', 'false');
    return button;
  }
}
