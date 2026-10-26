import type { Editor } from '@milkdown/kit/core';
import type { EditorView } from '@milkdown/kit/prose/view';
import { codeBlockAtCursor, COMMON_LANGUAGES, setCodeBlockLanguage } from '../editor/codeBlocks';
import { editorView } from '../editor/commands';
import { runTableAction, tablePosition, type TableAction } from '../editor/tables';

/**
 * A second toolbar row with controls for the table or code block at the cursor.
 *
 * The bar is hidden when the cursor is in neither.
 */
export class ContextBar {
  private readonly tableGroup: HTMLElement;
  private readonly codeGroup: HTMLElement;
  private readonly tableButtons = new Map<TableAction, HTMLButtonElement>();
  private readonly languageInput: HTMLInputElement;

  constructor(
    private readonly container: HTMLElement,
    private readonly getEditor: () => Editor | null,
  ) {
    container.hidden = true;
    this.tableGroup = this.createTableGroup();
    const { group, input } = this.createCodeGroup();
    this.codeGroup = group;
    this.languageInput = input;
    container.append(this.tableGroup, this.codeGroup);
  }

  /** Shows the controls that apply at the cursor, or hides the bar. */
  refresh(view: EditorView | null): void {
    const table = view ? tablePosition(view) : null;
    const code = view ? codeBlockAtCursor(view) : null;
    this.tableGroup.hidden = !table;
    this.codeGroup.hidden = !code;
    this.container.hidden = !table && !code;
    if (table) {
      this.tableButtons.get('delete-row')?.toggleAttribute('disabled', table.inHeader);
      for (const align of ['left', 'center', 'right'] as const) {
        this.tableButtons
          .get(`align-${align}`)
          ?.setAttribute('aria-pressed', String(table.alignment === align));
      }
    }
    if (code && document.activeElement !== this.languageInput) {
      this.languageInput.value = code.language;
    }
  }

  private withView(run: (view: EditorView) => void): void {
    const editor = this.getEditor();
    if (editor) run(editorView(editor));
  }

  private createTableGroup(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'context-group';
    const title = document.createElement('span');
    title.className = 'context-title';
    title.textContent = 'Table';
    group.append(title);

    const specs: Array<[TableAction, string] | 'separator'> = [
      ['row-above', 'Row above'],
      ['row-below', 'Row below'],
      ['column-left', 'Column left'],
      ['column-right', 'Column right'],
      'separator',
      ['align-left', 'Align left'],
      ['align-center', 'Center'],
      ['align-right', 'Align right'],
      'separator',
      ['delete-row', 'Delete row'],
      ['delete-column', 'Delete column'],
      ['delete-table', 'Delete table'],
    ];
    for (const spec of specs) {
      if (spec === 'separator') {
        const line = document.createElement('span');
        line.className = 'context-separator';
        group.append(line);
        continue;
      }
      const [action, label] = spec;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'context-button';
      button.textContent = label;
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => this.withView((view) => runTableAction(view, action)));
      this.tableButtons.set(action, button);
      group.append(button);
    }
    return group;
  }

  private createCodeGroup(): { group: HTMLElement; input: HTMLInputElement } {
    const group = document.createElement('div');
    group.className = 'context-group';
    const label = document.createElement('label');
    label.className = 'context-title';
    label.textContent = 'Code language';
    const input = document.createElement('input');
    input.className = 'language-input';
    input.placeholder = 'none';
    input.spellcheck = false;
    input.setAttribute('list', 'code-languages');
    input.setAttribute('aria-label', 'Code language');
    const list = document.createElement('datalist');
    list.id = 'code-languages';
    for (const language of COMMON_LANGUAGES) {
      const option = document.createElement('option');
      option.value = language;
      list.append(option);
    }
    const apply = (): void =>
      this.withView((view) => setCodeBlockLanguage(view, input.value.trim().toLowerCase()));
    input.addEventListener('change', apply);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        apply();
        this.withView((view) => view.focus());
      }
    });
    label.append(input);
    group.append(label, list);
    return { group, input };
  }
}
