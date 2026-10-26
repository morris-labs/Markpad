import type { Node } from '@milkdown/kit/prose/model';
import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

/** Callbacks that connect image handling to the tab's file. */
export interface ImageHost {
  /** Gets the path of the document's file, which relative image paths resolve against. */
  readonly documentPath: () => string;
  /** Copies a pasted or dropped file into the assets folder and returns its relative path. */
  readonly importFile: (file: File) => Promise<string>;
}

/** Converts a path with backslashes or forward slashes into its folder. */
function folderOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index < 0 ? '' : path.slice(0, index);
}

/** Joins a folder and a relative path, resolving `.` and `..` segments. */
function joinPath(folder: string, relative: string): string {
  const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  const parts = folder.split(/[\\/]/);
  for (const segment of relative.split(/[\\/]/)) {
    if (segment === '..') parts.pop();
    else if (segment !== '.' && segment !== '') parts.push(segment);
  }
  return parts.join(separator);
}

/**
 * Converts an image `src` from Markdown into a URL that the renderer can load.
 *
 * Web and data URLs pass through. Local paths, relative or absolute, go
 * through the `mdimg` scheme that the main process serves.
 */
export function resolveImageSrc(src: string, documentPath: string): string {
  if (/^(https?|data|mdimg):/i.test(src)) return src;
  let path: string;
  if (/^file:/i.test(src)) {
    path = decodeURIComponent(new URL(src).pathname).replace(/^\/([a-z]:)/i, '$1');
  } else {
    const decoded = (() => {
      try {
        return decodeURI(src);
      } catch {
        return src;
      }
    })();
    const isAbsolute = /^([a-z]:[\\/]|[\\/])/i.test(decoded);
    path = isAbsolute ? decoded : joinPath(folderOf(documentPath), decoded);
  }
  return `mdimg://local/${encodeURIComponent(path)}`;
}

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
}

/** Imports files and inserts them as images at `pos`, or at the selection. */
async function insertImages(
  view: EditorView,
  host: ImageHost,
  files: readonly File[],
  pos?: number,
): Promise<void> {
  const type = view.state.schema.nodes['image'];
  if (!type) return;
  for (const file of files) {
    const src = await host.importFile(file);
    const alt = file.name.replace(/\.[^.]+$/, '');
    const node = type.create({ src, alt, title: '' });
    const tr =
      pos === undefined
        ? view.state.tr.replaceSelectionWith(node)
        : view.state.tr.insert(pos, node);
    view.dispatch(tr);
    if (pos !== undefined) pos += node.nodeSize;
  }
}

/** Creates the plugin that renders local images and imports pasted or dropped ones. */
export function imagePlugin(host: ImageHost) {
  const report = (error: unknown): void => console.error('Image import failed:', error);
  return $prose(
    () =>
      new Plugin({
        props: {
          nodeViews: {
            image: (initial: Node) => {
              const img = document.createElement('img');
              const render = (node: Node): void => {
                const src = String(node.attrs['src'] ?? '');
                img.dataset['src'] = src;
                img.src = resolveImageSrc(src, host.documentPath());
                img.alt = String(node.attrs['alt'] ?? '');
                const title = String(node.attrs['title'] ?? '');
                if (title) img.title = title;
                else img.removeAttribute('title');
              };
              render(initial);
              return {
                dom: img,
                update: (node: Node) => {
                  if (node.type !== initial.type) return false;
                  render(node);
                  return true;
                },
              };
            },
          },
          handlePaste: (view, event) => {
            const files = imageFiles(event.clipboardData?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            insertImages(view, host, files).catch(report);
            return true;
          },
          handleDrop: (view, event) => {
            const files = imageFiles(event.dataTransfer?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            insertImages(view, host, files, pos).catch(report);
            return true;
          },
        },
      }),
  );
}

/** Points every rendered image at its file again, after the document moves. */
export function refreshImages(root: HTMLElement, documentPath: string): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-src]')) {
    img.src = resolveImageSrc(img.dataset['src'] ?? '', documentPath);
  }
}

/** Inserts an image that was already copied into the assets folder. */
export function insertImageAtSelection(view: EditorView, src: string, alt: string): void {
  const type = view.state.schema.nodes['image'];
  if (!type) return;
  view.dispatch(view.state.tr.replaceSelectionWith(type.create({ src, alt, title: '' })));
  view.focus();
}
