/** A small modal dialog for typing or pasting the path of a file to open. */
export class OpenPathDialog {
  private readonly dialog = document.createElement('dialog');
  private readonly input = document.createElement('input');
  private readonly error = document.createElement('p');
  private pastedLines: string | null = null;

  /**
   * @param submit Opens the entered path; returns a message to show if it can't,
   *     or null when the dialog can close.
   */
  constructor(private readonly submit: (text: string) => Promise<string | null>) {
    this.dialog.className = 'open-path-dialog';
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = 'Open path';
    label.htmlFor = 'open-path-input';
    this.input.id = 'open-path-input';
    this.input.spellcheck = false;
    this.input.placeholder = '~/notes/plan.md';
    this.error.className = 'open-path-error';
    this.error.hidden = true;
    form.append(label, this.input, this.error);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.confirm();
    });
    // An input drops line breaks, so keep each pasted line as its own path.
    this.input.addEventListener('paste', (event) => {
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!/\r?\n./.test(text.trim())) return;
      event.preventDefault();
      this.pastedLines = text;
      void this.confirm();
    });
    this.dialog.append(form);
    document.body.append(this.dialog);
  }

  open(): void {
    if (this.dialog.open) return;
    this.input.value = '';
    this.showError(null);
    this.dialog.showModal();
    this.input.focus();
  }

  private async confirm(): Promise<void> {
    const text = this.pastedLines ?? this.input.value;
    this.pastedLines = null;
    if (!text.trim()) return;
    const message = await this.submit(text);
    this.showError(message);
    if (message === null) this.dialog.close();
  }

  private showError(message: string | null): void {
    this.error.textContent = message ?? '';
    this.error.hidden = message === null;
  }
}
