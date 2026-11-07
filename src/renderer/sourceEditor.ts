import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: 'bold', color: 'var(--accent)' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' },
  { tag: tags.monospace, fontFamily: 'var(--mono-font)', color: 'var(--syntax-string)' },
  {
    tag: [tags.processingInstruction, tags.contentSeparator, tags.meta],
    color: 'var(--text-muted)',
  },
  { tag: tags.quote, color: 'var(--text-muted)' },
  // Code in other languages, in the same colors as code blocks in documents.
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--syntax-comment)' },
  {
    tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.modifier],
    color: 'var(--syntax-keyword)',
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--syntax-string)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--syntax-number)' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.className],
    color: 'var(--syntax-function)',
  },
  { tag: [tags.tagName, tags.typeName], color: 'var(--syntax-tag)' },
  { tag: [tags.attributeName, tags.propertyName], color: 'var(--syntax-attr)' },
]);

/** What a source editor holds: a Markdown document, or another kind of file. */
export interface SourceOptions {
  /**
   * The file name that picks the syntax highlighting, or null for Markdown.
   * A name with no known language shows as plain text.
   */
  readonly fileName: string | null;
}

/** Gets the display name of the language for a file, such as `Java`, or null if it has none. */
export function languageName(fileName: string): string | null {
  return LanguageDescription.matchFilename(languages, fileName)?.name ?? null;
}

/** A plain-text editor for Markdown source and for other text and code files. */
export class SourceEditor {
  private readonly view: EditorView;

  /**
   * @param parent The element to mount into.
   * @param text The full file text.
   * @param onChange Called after each edit.
   * @param options What kind of file the text is. Default: Markdown.
   */
  constructor(
    parent: HTMLElement,
    text: string,
    onChange: () => void,
    options: SourceOptions = { fileName: null },
  ) {
    const language = new Compartment();
    const description =
      options.fileName === null
        ? null
        : LanguageDescription.matchFilename(languages, options.fileName);
    // Code reads better unwrapped and without spelling marks; prose needs both.
    const isProse = options.fileName === null || description === null;
    const prose: Extension[] = isProse ? [EditorView.lineWrapping] : [];
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          language.of(options.fileName === null ? markdown() : []),
          syntaxHighlighting(markdownHighlight),
          ...prose,
          EditorView.contentAttributes.of({
            spellcheck: String(isProse),
            'aria-label': options.fileName === null ? 'Markdown source' : 'File text',
          }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange();
          }),
        ],
      }),
    });
    // Language support loads on demand, so it arrives after the text shows.
    if (description) {
      void description.load().then((support) => {
        this.view.dispatch({ effects: language.reconfigure(support) });
      });
    }
  }

  get text(): string {
    return this.view.state.doc.toString();
  }

  /** Replaces the whole text, as after an outside change. */
  setText(text: string): void {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
  }

  focus(): void {
    this.view.focus();
  }

  openSearch(): void {
    openSearchPanel(this.view);
  }

  undo(): void {
    undo(this.view);
  }

  redo(): void {
    redo(this.view);
  }

  destroy(): void {
    this.view.destroy();
  }
}
