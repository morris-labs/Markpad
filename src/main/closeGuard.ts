/** Forces a window close when the renderer never answers the close request. */
export class CloseGuard {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly timeoutMs: number,
    private readonly force: () => void,
  ) {}

  /** Starts the countdown. Repeated calls while armed are ignored. */
  arm(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.force();
    }, this.timeoutMs);
  }

  /** Cancels the countdown. */
  disarm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
