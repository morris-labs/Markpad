const FRONT_MATTER = /^---[ \t]*\n([\s\S]*?\n)?(?:---|\.\.\.)[ \t]*(?:\n|$)/;

/** A Markdown file split into the parts that the editor handles separately. */
export interface MarkdownFile {
  /** The front matter between its `---` lines, or null if the file has none. */
  readonly frontMatter: string | null;
  /** The raw front matter block, delimiters included, as it was on disk. */
  readonly frontMatterSource: string | null;
  /** The blank lines between the front matter and the body. */
  readonly frontMatterGap: string;
  /** The Markdown body with LF line endings and no trailing newlines. */
  readonly body: string;
  readonly eol: '\n' | '\r\n';
  readonly finalNewline: boolean;
}

/** Splits file text into front matter and body, and records its line endings. */
export function parseMarkdownFile(text: string): MarkdownFile {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  const eol = crlf > lf ? '\r\n' : '\n';
  let rest = text.replace(/\r\n/g, '\n');
  // An empty file gets the POSIX convention of a trailing newline once it has text.
  const finalNewline = rest === '' || rest.endsWith('\n');

  let frontMatter: string | null = null;
  let frontMatterSource: string | null = null;
  let frontMatterGap = '';
  const match = FRONT_MATTER.exec(rest);
  if (match) {
    frontMatterSource = match[0];
    frontMatter = (match[1] ?? '').replace(/\n$/, '');
    rest = rest.slice(match[0].length);
    frontMatterGap = /^\n*/.exec(rest)?.[0] ?? '';
    rest = rest.slice(frontMatterGap.length);
  }
  return {
    frontMatter,
    frontMatterSource,
    frontMatterGap,
    body: rest.replace(/\n+$/, ''),
    eol,
    finalNewline,
  };
}

/**
 * Joins front matter and body into file text in the original file's format.
 *
 * @param original The file as it was parsed on load.
 * @param frontMatter The front matter text, or null to omit it.
 * @param body The Markdown body.
 */
export function formatMarkdownFile(
  original: MarkdownFile,
  frontMatter: string | null,
  body: string,
): string {
  let text = '';
  if (frontMatter !== null) {
    text +=
      frontMatter === original.frontMatter && original.frontMatterSource !== null
        ? original.frontMatterSource
        : `---\n${frontMatter === '' ? '' : `${frontMatter}\n`}---\n`;
    const trimmedBody = body.replace(/\n+$/, '');
    if (trimmedBody !== '') text += original.frontMatter !== null ? original.frontMatterGap : '\n';
  }
  text += body.replace(/\n+$/, '');
  if (original.finalNewline && text !== '' && !text.endsWith('\n')) text += '\n';
  return original.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}
