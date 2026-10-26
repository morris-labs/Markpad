/** A small floating panel anchored to an element, closed by Escape or an outside click. */
export class Popover {
  readonly element: HTMLElement;
  private cleanup: (() => void) | null = null;

  constructor(className: string) {
    this.element = document.createElement('div');
    this.element.className = `popover ${className}`;
    this.element.hidden = true;
    document.body.append(this.element);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** Shows the popover under `anchor`, or at a viewport point. */
  open(anchor: HTMLElement | { x: number; y: number }): void {
    this.close();
    this.element.hidden = false;
    const point =
      anchor instanceof HTMLElement
        ? { x: anchor.getBoundingClientRect().left, y: anchor.getBoundingClientRect().bottom + 4 }
        : anchor;
    const width = this.element.offsetWidth;
    this.element.style.left = `${Math.max(8, Math.min(point.x, window.innerWidth - width - 8))}px`;
    this.element.style.top = `${point.y}px`;

    const onPointer = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof globalThis.Node && this.element.contains(target)) return;
      if (
        anchor instanceof HTMLElement &&
        target instanceof globalThis.Node &&
        anchor.contains(target)
      ) {
        return;
      }
      this.close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    };
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    this.cleanup = () => {
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }

  close(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.element.hidden = true;
  }
}
