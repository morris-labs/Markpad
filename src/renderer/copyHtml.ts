import type { EditorView } from '@milkdown/kit/prose/view';
import { cleanRenderedContent, EXPORT_CSS } from './exportDocument';

/**
 * Properties that children inherit, so an element's inline style lists them
 * only where they differ from its parent's.
 */
const INHERITED_PROPERTIES = [
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'line-height',
  'list-style-type',
  'text-align',
  'white-space',
];

/** Properties that don't inherit, listed when they differ from their initial value. */
const OWN_PROPERTIES: Record<string, (value: string) => boolean> = {
  'background-color': (value) => value === 'rgba(0, 0, 0, 0)' || value === 'transparent',
  'text-decoration-line': (value) => value === 'none',
  'vertical-align': (value) => value === 'baseline',
  'border-collapse': (value) => value === 'separate',
  'border-radius': (value) => value === '0px',
  'max-width': (value) => value === 'none',
};

const SIDES = ['top', 'right', 'bottom', 'left'];

/** Attributes that a copied element keeps; inline styles replace the rest. */
const KEPT_ATTRIBUTES = new Set(['href', 'title', 'src', 'alt', 'colspan', 'rowspan', 'start']);

/** Gets the inline style that reproduces an element's computed look. */
function inlineStyle(element: Element, parent: Element | null, view: Window): string {
  const style = view.getComputedStyle(element);
  const parentStyle = parent ? view.getComputedStyle(parent) : null;
  const declarations: string[] = [];
  for (const name of INHERITED_PROPERTIES) {
    const value = style.getPropertyValue(name);
    if (value !== parentStyle?.getPropertyValue(name)) declarations.push(`${name}: ${value}`);
  }
  for (const [name, isInitial] of Object.entries(OWN_PROPERTIES)) {
    const value = style.getPropertyValue(name);
    if (!isInitial(value)) declarations.push(`${name}: ${value}`);
  }
  for (const side of SIDES) {
    for (const box of ['margin', 'padding']) {
      const value = style.getPropertyValue(`${box}-${side}`);
      if (value !== '0px') declarations.push(`${box}-${side}: ${value}`);
    }
    const width = style.getPropertyValue(`border-${side}-width`);
    const lineStyle = style.getPropertyValue(`border-${side}-style`);
    if (width !== '0px' && lineStyle !== 'none') {
      const color = style.getPropertyValue(`border-${side}-color`);
      declarations.push(`border-${side}: ${width} ${lineStyle} ${color}`);
    }
  }
  return declarations.join('; ');
}

/**
 * Gets a copy of the selected content, wrapped in copies of the elements
 * that hold it, such as the list around selected list items.
 */
function cloneSelection(view: EditorView): HTMLElement {
  const root = document.createElement('div');
  const { from, to, empty } = view.state.selection;
  if (empty) {
    for (const child of view.dom.childNodes) root.append(child.cloneNode(true));
    return root;
  }
  const start = view.domAtPos(from);
  const end = view.domAtPos(to);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  let content: Node = range.cloneContents();
  for (
    let ancestor: Node | null = range.commonAncestorContainer;
    ancestor && ancestor !== view.dom;
    ancestor = ancestor.parentNode
  ) {
    if (!(ancestor instanceof Element)) continue;
    const wrapper = ancestor.cloneNode(false);
    wrapper.appendChild(content);
    content = wrapper;
  }
  root.append(content);
  return root;
}

/** Replaces task list checkboxes, which the styles draw, with text. */
function markTaskItems(content: HTMLElement): void {
  for (const item of content.querySelectorAll<HTMLElement>("li[data-item-type='task']")) {
    const box = document.createElement('span');
    box.textContent = item.dataset['checked'] === 'true' ? '☑ ' : '☐ ';
    const target = item.querySelector(':scope > p') ?? item;
    target.prepend(box);
    item.removeAttribute('data-item-type');
    item.style.listStyleType = 'none';
  }
}

/**
 * Builds HTML for the selection, or for the whole document if nothing is
 * selected, with styles inlined so that email programs keep them.
 *
 * The HTML uses the light theme, and local images are embedded as data URIs.
 *
 * @returns The HTML and the plain text of the same content.
 */
export async function buildClipboardHtml(
  view: EditorView,
): Promise<{ html: string; text: string }> {
  const content = cloneSelection(view);
  await cleanRenderedContent(content);
  markTaskItems(content);

  // A detached frame with the export styles gives light-theme computed styles.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position: fixed; left: -10000px; width: 800px; height: 600px;';
  document.body.append(frame);
  try {
    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDocument || !frameWindow) throw new Error('No frame to compute styles in.');
    const style = frameDocument.createElement('style');
    style.textContent = EXPORT_CSS;
    frameDocument.head.append(style);
    frameDocument.body.innerHTML =
      '<div class="editor-host"><div class="milkdown"><div class="ProseMirror"></div></div></div>';
    const holder = frameDocument.querySelector('.ProseMirror');
    if (!holder) throw new Error('No frame to compute styles in.');
    holder.append(frameDocument.importNode(content, true));
    const wrapper = holder.firstElementChild;
    if (!wrapper) throw new Error('Nothing to copy.');

    const styled = new Map<Element, string>();
    styled.set(wrapper, inlineStyle(wrapper, null, frameWindow));
    for (const element of wrapper.querySelectorAll('*')) {
      styled.set(element, inlineStyle(element, element.parentElement, frameWindow));
    }
    for (const [element, css] of styled) {
      // Editor attributes, such as data-* and id, mean nothing in an email.
      for (const { name } of [...element.attributes]) {
        if (!KEPT_ATTRIBUTES.has(name)) element.removeAttribute(name);
      }
      if (css) element.setAttribute('style', css);
      else element.removeAttribute('style');
    }
    const { from, to, empty } = view.state.selection;
    const doc = view.state.doc;
    const text = empty
      ? doc.textBetween(0, doc.content.size, '\n\n')
      : doc.textBetween(from, to, '\n\n');
    return { html: wrapper.outerHTML, text };
  } finally {
    frame.remove();
  }
}
