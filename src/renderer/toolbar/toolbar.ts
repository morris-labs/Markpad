import type { Editor } from '@milkdown/kit/core';
import {
  editorView,
  insertTable,
  runFormatAction,
  setHeadingLevel,
  type FormatAction,
  type FormatState,
} from '../editor/commands';
import { applyLink, linkAtSelection } from '../editor/links';
import { icon, type IconName } from './icons';
import { Popover } from './popover';

/** Commands that the toolbar can't run on the editor by itself. */
export type ToolbarCommand = 'insert-image' | 'find' | 'toggle-outline' | 'toggle-source';

/** The app services that the toolbar uses. */
export interface ToolbarHost {
  /** Gets the active tab's editor, or null when the active tab shows its source. */
  readonly getEditor: () => Editor | null;
  readonly runCommand: (command: ToolbarCommand) => void;
}

const isMac = navigator.userAgent.includes('Mac');
const mod = isMac ? 'Cmd' : 'Ctrl';

const TABLE_PICKER_SIZE = 8;

interface ButtonSpec {
  readonly icon: IconName;
  readonly label: string;
  readonly shortcut?: string;
  readonly state?: keyof FormatState;
  readonly run: (button: HTMLButtonElement) => void;
}

/** The single row of formatting controls at the top of the window. */
export class Toolbar {
  private readonly stateButtons = new Map<keyof FormatState, HTMLButtonElement>();
  private readonly editorButtons: HTMLButtonElement[] = [];
  private readonly styleSelect: HTMLSelectElement;
  private readonly sourceButton: HTMLButtonElement;
  private readonly outlineButton: HTMLButtonElement;
  private readonly linkPopover = new Popover('link-popover');
  private readonly tablePopover = new Popover('table-popover');

  constructor(
    private readonly container: HTMLElement,
    private readonly host: ToolbarHost,
  ) {
    const format = (action: FormatAction) => () => {
      const editor = host.getEditor();
      if (editor) runFormatAction(editor, action);
    };

    this.styleSelect = this.createStyleSelect();
    const group = (...items: HTMLElement[]): void => {
      const element = document.createElement('div');
      element.className = 'toolbar-group';
      element.append(...items);
      container.append(element);
    };
    const make = (spec: ButtonSpec, needsEditor = true): HTMLButtonElement =>
      this.createButton(spec, needsEditor);

    group(
      make({ icon: 'undo', label: 'Undo', shortcut: `${mod}+Z`, run: format('undo') }),
      make({
        icon: 'redo',
        label: 'Redo',
        shortcut: isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y',
        run: format('redo'),
      }),
    );
    group(this.styleSelect);
    group(
      make({
        icon: 'bold',
        label: 'Bold',
        shortcut: `${mod}+B`,
        state: 'strong',
        run: format('bold'),
      }),
      make({
        icon: 'italic',
        label: 'Italic',
        shortcut: `${mod}+I`,
        state: 'emphasis',
        run: format('italic'),
      }),
      make({
        icon: 'strike',
        label: 'Strikethrough',
        shortcut: `${mod}+Alt+X`,
        state: 'strike',
        run: format('strike'),
      }),
      make({
        icon: 'code',
        label: 'Inline code',
        shortcut: `${mod}+E`,
        state: 'code',
        run: format('code'),
      }),
      make({
        icon: 'link',
        label: 'Link',
        shortcut: `${mod}+K`,
        state: 'link',
        run: (b) => this.openLinkEditor(b),
      }),
    );
    group(
      make({
        icon: 'bulletList',
        label: 'Bulleted list',
        state: 'bulletList',
        run: format('bullet-list'),
      }),
      make({
        icon: 'orderedList',
        label: 'Numbered list',
        state: 'orderedList',
        run: format('ordered-list'),
      }),
      make({ icon: 'taskList', label: 'Task list', state: 'taskList', run: format('task-list') }),
      make({ icon: 'quote', label: 'Quote', state: 'blockquote', run: format('blockquote') }),
      make({
        icon: 'codeBlock',
        label: 'Code block',
        state: 'codeBlock',
        run: format('code-block'),
      }),
    );
    group(
      make({ icon: 'table', label: 'Insert table', run: (b) => this.openTablePicker(b) }),
      make({ icon: 'hr', label: 'Horizontal line', run: format('hr') }),
      make({ icon: 'image', label: 'Insert image', run: () => host.runCommand('insert-image') }),
    );
    const spacer = document.createElement('div');
    spacer.className = 'toolbar-spacer';
    container.append(spacer);
    this.outlineButton = make(
      {
        icon: 'outline',
        label: 'Outline',
        shortcut: `${mod}+Shift+O`,
        run: () => host.runCommand('toggle-outline'),
      },
      false,
    );
    this.sourceButton = make(
      {
        icon: 'source',
        label: 'Markdown source',
        shortcut: `${mod}+/`,
        run: () => host.runCommand('toggle-source'),
      },
      false,
    );
    group(
      make(
        {
          icon: 'find',
          label: 'Find and replace',
          shortcut: `${mod}+F`,
          run: () => host.runCommand('find'),
        },
        false,
      ),
      this.outlineButton,
      this.sourceButton,
    );
    this.buildTablePicker();
  }

  /** Updates button states from the editor state, or disables them for source view. */
  refresh(state: FormatState | null, view: { source: boolean; outline: boolean }): void {
    for (const button of this.editorButtons) button.disabled = state === null;
    this.styleSelect.disabled = state === null;
    for (const [key, button] of this.stateButtons) {
      button.setAttribute('aria-pressed', String(state ? Boolean(state[key]) : false));
    }
    this.styleSelect.value = state && state.headingLevel >= 0 ? String(state.headingLevel) : '';
    this.sourceButton.setAttribute('aria-pressed', String(view.source));
    this.outlineButton.setAttribute('aria-pressed', String(view.outline));
  }

  /** Opens the link editor for the selection, anchored to the Link button. */
  openLinkEditor(anchor?: HTMLElement): void {
    const editor = this.host.getEditor();
    if (!editor) return;
    const view = editorView(editor);
    const existing = linkAtSelection(view.state);
    const target = anchor ?? this.stateButtons.get('link');
    if (!target) return;

    const input = document.createElement('input');
    input.type = 'url';
    input.placeholder = 'https://example.com or ./other.md';
    input.value = typeof existing?.attrs['href'] === 'string' ? existing.attrs['href'] : '';
    input.setAttribute('aria-label', 'Link address');
    const apply = document.createElement('button');
    apply.textContent = 'Apply';
    apply.className = 'primary';
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.hidden = !existing;

    const commit = (href: string): void => {
      this.linkPopover.close();
      applyLink(view, href);
    };
    apply.addEventListener('click', () => commit(input.value.trim()));
    remove.addEventListener('click', () => commit(''));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit(input.value.trim());
      }
    });

    this.linkPopover.element.replaceChildren(input, apply, remove);
    this.linkPopover.open(target);
    input.focus();
    input.select();
  }

  private createButton(spec: ButtonSpec, needsEditor: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-button';
    button.title = spec.shortcut ? `${spec.label} (${spec.shortcut})` : spec.label;
    button.setAttribute('aria-label', spec.label);
    button.append(icon(spec.icon));
    // Keep focus and the selection in the editor.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => spec.run(button));
    if (spec.state) {
      button.setAttribute('aria-pressed', 'false');
      this.stateButtons.set(spec.state, button);
    }
    if (needsEditor) this.editorButtons.push(button);
    return button;
  }

  private createStyleSelect(): HTMLSelectElement {
    const select = document.createElement('select');
    select.className = 'style-select';
    select.title = 'Paragraph style';
    select.setAttribute('aria-label', 'Paragraph style');
    const options: Array<[string, string]> = [
      ['0', 'Normal text'],
      ['1', 'Heading 1'],
      ['2', 'Heading 2'],
      ['3', 'Heading 3'],
      ['4', 'Heading 4'],
      ['5', 'Heading 5'],
      ['6', 'Heading 6'],
    ];
    for (const [value, label] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    const other = document.createElement('option');
    other.value = '';
    other.textContent = '-';
    other.hidden = true;
    select.append(other);
    // Capture the editor selection before focus moves to the list.
    const sync = (): void => {
      const editor = this.host.getEditor();
      if (editor) editorView(editor);
    };
    select.addEventListener('pointerdown', sync);
    select.addEventListener('focus', sync);
    select.addEventListener('change', () => {
      const editor = this.host.getEditor();
      if (editor && select.value !== '') setHeadingLevel(editor, Number(select.value));
    });
    return select;
  }

  private buildTablePicker(): void {
    const grid = document.createElement('div');
    grid.className = 'table-grid';
    const label = document.createElement('div');
    label.className = 'table-size';
    label.textContent = 'Insert table';
    const cells: HTMLElement[] = [];
    for (let row = 1; row <= TABLE_PICKER_SIZE; row++) {
      for (let col = 1; col <= TABLE_PICKER_SIZE; col++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.dataset['row'] = String(row);
        cell.dataset['col'] = String(col);
        cell.setAttribute('aria-label', `${row} by ${col} table`);
        cell.addEventListener('mouseenter', () => {
          label.textContent = `${col} x ${row}`;
          for (const other of cells) {
            other.classList.toggle(
              'selected',
              Number(other.dataset['row']) <= row && Number(other.dataset['col']) <= col,
            );
          }
        });
        cell.addEventListener('click', () => {
          this.tablePopover.close();
          const editor = this.host.getEditor();
          if (editor) insertTable(editor, row, col);
        });
        cells.push(cell);
      }
    }
    grid.append(...cells);
    this.tablePopover.element.append(grid, label);
  }

  private openTablePicker(anchor: HTMLElement): void {
    this.tablePopover.open(anchor);
  }
}
