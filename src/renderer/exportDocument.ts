import documentCss from './styles/document.css?raw';
import syntaxCss from './styles/syntax.css?raw';
import tokensCss from './styles/tokens.css?raw';

/** Styles for exported files: the light theme only, plus print layout. */
export const EXPORT_CSS = `${tokensCss.split('/* dark-theme */')[0] ?? ''}
${documentCss}
${syntaxCss}
:root { color-scheme: light; }
body { margin: 0; background: var(--bg); color: var(--text); }
.editor-host { margin: 32px auto; padding: 0 16px; }
.editor-host .milkdown { min-height: 0; }
@page { margin: 18mm; }
@media print {
  body { background: #fff; }
  .editor-host { margin: 0; padding: 0; max-width: none; }
  .editor-host .milkdown { padding: 0; box-shadow: none; }
  .ProseMirror pre, .ProseMirror table, .ProseMirror img { break-inside: avoid; }
  .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 { break-after: avoid; }
}
`;

/** Classes that only make sense while editing. */
const EDITING_CLASSES = [
  'ProseMirror-focused',
  'ProseMirror-selectednode',
  'search-match',
  'search-match-current',
  'selectedCell',
];

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(reader.error?.message ?? 'Read failed'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Removes editing markup from a copy of rendered editor content, and embeds
 * its local images as data URIs.
 *
 * @param content A detached copy of rendered content, which this function changes.
 */
export async function cleanRenderedContent(content: HTMLElement): Promise<void> {
  content.removeAttribute('contenteditable');
  for (const element of content.querySelectorAll(
    '.ProseMirror-separator, .ProseMirror-trailingBreak',
  )) {
    element.remove();
  }
  for (const element of content.querySelectorAll('[contenteditable]')) {
    element.removeAttribute('contenteditable');
  }
  for (const name of EDITING_CLASSES) {
    for (const element of content.querySelectorAll(`.${name}`)) element.classList.remove(name);
  }
  content.classList.remove(...EDITING_CLASSES);
  await Promise.all(
    [...content.querySelectorAll('img')].map(async (img) => {
      if (img.src.startsWith('mdimg:')) {
        const data = await toDataUrl(img.src);
        if (data) img.src = data;
      }
      img.removeAttribute('data-src');
    }),
  );
}

/**
 * Builds a standalone HTML page from the rendered document.
 *
 * Local images are embedded as data URIs, so the page has no outside
 * dependencies; web images keep their URLs.
 *
 * @param rendered The editor's content element.
 * @param fallbackTitle The page title when the document has no level 1 heading.
 */
export async function buildExportHtml(
  rendered: HTMLElement,
  fallbackTitle: string,
): Promise<string> {
  const content = rendered.cloneNode(true);
  if (!(content instanceof HTMLElement)) throw new Error('The document has no content to export.');
  content.removeAttribute('translate');
  content.removeAttribute('role');
  await cleanRenderedContent(content);

  const title = content.querySelector('h1')?.textContent?.trim() || fallbackTitle;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Markpad">
<title>${escapeHtml(title)}</title>
<style>
${EXPORT_CSS}
</style>
</head>
<body>
<div class="editor-host"><div class="milkdown">${content.outerHTML}</div></div>
</body>
</html>
`;
}
