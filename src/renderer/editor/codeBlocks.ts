import type { EditorView } from '@milkdown/kit/prose/view';

/** Languages offered in the code block language list; any other name also works. */
export const COMMON_LANGUAGES: readonly string[] = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'go',
  'html',
  'ini',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'makefile',
  'markdown',
  'php',
  'python',
  'ruby',
  'rust',
  'sql',
  'swift',
  'typescript',
  'xml',
  'yaml',
];

/** Gets the code block around the cursor and its position, or null. */
export function codeBlockAtCursor(view: EditorView): { pos: number; language: string } | null {
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'code_block') {
      const language = node.attrs['language'];
      return { pos: $from.before(depth), language: typeof language === 'string' ? language : '' };
    }
  }
  return null;
}

/** Sets the language of the code block around the cursor. */
export function setCodeBlockLanguage(view: EditorView, language: string): void {
  const block = codeBlockAtCursor(view);
  if (!block) return;
  const node = view.state.doc.nodeAt(block.pos);
  if (!node) return;
  view.dispatch(view.state.tr.setNodeMarkup(block.pos, undefined, { ...node.attrs, language }));
}
