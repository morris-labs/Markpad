/** Inline SVG icons for the toolbar, drawn on a 24x24 grid with a 2px stroke. */
const PATHS = {
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
  strike:
    '<path d="M5 12h14M16 7.5C15.4 6 13.9 5 12 5c-2.5 0-4 1.3-4 3 0 1.3.8 2.3 2.5 3M8 16.5c.6 1.6 2.1 2.5 4 2.5 2.5 0 4-1.3 4-3 0-.6-.1-1.1-.4-1.5"/>',
  code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bulletList:
    '<path d="M10 6h10M10 12h10M10 18h10"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="18" r="1" fill="currentColor"/>',
  orderedList:
    '<path d="M10 6h10M10 12h10M10 18h10M4 4.5l1.5-1V9M4 9h3M4 14.5c0-.8.7-1.5 1.5-1.5S7 13.7 7 14.5c0 1.5-3 2-3 4.5h3"/>',
  taskList:
    '<rect x="3" y="4" width="5" height="5" rx="1"/><path d="M3.8 16.5l1.5 1.5L8 15M11 6.5h9M11 16.5h9"/>',
  quote: '<path d="M5 6v12M10 8h9M10 12h9M10 16h6"/>',
  codeBlock:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 10l-2 2 2 2M14 10l2 2-2 2"/>',
  table:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
  hr: '<path d="M3 12h18"/><path d="M6 6h12M6 18h12" stroke-width="1.5" stroke-opacity=".45"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-9 9"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  outline: '<path d="M4 5h16M8 10h12M8 15h12M4 20h16" />',
  find: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  source: '<path d="M4 6h3M4 12h3M4 18h3M10 6l4 12"/><path d="M17 9l3 3-3 3"/>',
  print:
    '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** Creates an SVG icon element. */
export function icon(name: IconName): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
  const svg = template.content.firstElementChild;
  if (!(svg instanceof SVGSVGElement)) throw new Error(`Icon ${name} failed to render.`);
  return svg;
}
