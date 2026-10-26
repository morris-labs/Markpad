import { redoCommand, undoCommand } from '@milkdown/kit/plugin/history';
import { callCommand } from '@milkdown/kit/utils';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { FileSnapshot, MenuAction, SessionTab } from '@shared/api';
import { getFormatState } from './editor/commands';
import { insertImageAtSelection } from './editor/images';
import { resolveLink } from './editor/links';
import { LinkBubble } from './toolbar/linkBubble';
import { ContextBar } from './toolbar/contextBar';
import { Toolbar, type ToolbarCommand } from './toolbar/toolbar';
import { DocumentTab, type TabHost, type TabSource } from './documentTab';

/** Owns the tabs, the tab bar, and the status bar, and routes menu commands. */
export class App implements TabHost {
  private readonly tabs: DocumentTab[] = [];
  private active: DocumentTab | null = null;

  private readonly toolbar: Toolbar;
  private readonly contextBar: ContextBar;
  private readonly linkBubble: LinkBubble;

  constructor(
    toolbarElement: HTMLElement,
    contextBarElement: HTMLElement,
    private readonly tabBar: HTMLElement,
    private readonly documents: HTMLElement,
    private readonly statusBar: HTMLElement,
  ) {
    this.toolbar = new Toolbar(toolbarElement, {
      getEditor: () => this.active?.document.editor.editor ?? null,
      runCommand: (command) => void this.runToolbarCommand(command),
    });
    this.contextBar = new ContextBar(
      contextBarElement,
      () => this.active?.document.editor.editor ?? null,
    );
    this.linkBubble = new LinkBubble({
      openLink: (href) => {
        if (this.active) this.openLink(this.active, href);
      },
      editLink: (anchor) => this.toolbar.openLinkEditor(anchor),
    });
    documents.addEventListener('scroll', () => this.linkBubble.hide(), true);
    const trackModifier = (event: KeyboardEvent): void => {
      const down = window.markpad.platform === 'darwin' ? event.metaKey : event.ctrlKey;
      document.body.classList.toggle('modifier-down', down);
    };
    document.addEventListener('keydown', trackModifier);
    document.addEventListener('keyup', trackModifier);
    window.addEventListener('blur', () => document.body.classList.remove('modifier-down'));
    document.addEventListener('keydown', (event) => {
      const modifier = window.markpad.platform === 'darwin' ? event.metaKey : event.ctrlKey;
      if (modifier && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.toolbar.openLinkEditor();
      }
    });
  }

  get activeTab(): DocumentTab | null {
    return this.active;
  }

  /** Restores the last session, opens requested files, and installs listeners. */
  async start(): Promise<void> {
    const api = window.markpad;
    api.onMenuAction((action) => void this.runMenuAction(action));
    api.onOpenPaths((paths) => void this.openPaths(paths));
    api.onFileChanged((snapshot) => void this.handleOutsideChange(snapshot));
    api.onBeforeClose(() => this.flushAll());

    const { session, openPaths } = await api.getStartupState();
    for (const entry of session.tabs) {
      await this.restoreTab(entry);
    }
    const restoredActive = this.tabs[session.activeIndex];
    if (restoredActive) this.activate(restoredActive);
    await this.openPaths(openPaths);
    if (this.tabs.length === 0) await this.newDraft();
  }

  onEditorState(tab: DocumentTab): void {
    if (tab === this.active && tab.isMounted) this.refreshToolbar(tab.document.editor.view);
  }

  onTabChanged(tab: DocumentTab): void {
    this.renderTabBar();
    if (tab === this.active) this.renderChrome();
  }

  onSaveError(tab: DocumentTab, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    this.statusBar.dataset['error'] = 'true';
    this.setStatus(`Couldn't save ${tab.title}: ${reason}`);
  }

  async newDraft(): Promise<void> {
    const draft = await window.markpad.createDraft();
    await this.addTab({ kind: 'draft', id: draft.id, path: draft.path }, draft.text);
  }

  async openWithDialog(): Promise<void> {
    await this.openPaths(await window.markpad.showOpenDialog());
  }

  /** Opens each path in a tab, or focuses the tab that already has it. */
  async openPaths(paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      const existing = this.tabs.find((t) => t.source.kind === 'file' && t.source.path === path);
      if (existing) {
        this.activate(existing);
        continue;
      }
      try {
        const file = await window.markpad.readFile(path);
        // Replace a single untouched, empty draft, like a word processor does.
        const only = this.tabs.length === 1 ? this.tabs[0] : undefined;
        await this.addTab({ kind: 'file', path }, file.text);
        if (only && only.source.kind === 'draft' && only.isEmpty) await this.closeTab(only);
        await window.markpad.addRecentFile(path);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await window.markpad.ask({
          message: `Couldn't open ${path}`,
          detail: reason,
          buttons: ['OK'],
        });
      }
    }
  }

  async saveAs(tab: DocumentTab): Promise<void> {
    const api = window.markpad;
    const suggested =
      tab.source.kind === 'file' ? tab.source.path : `${tab.title.replace(/[\\/:*?"<>|]/g, '')}.md`;
    const path = await api.showSaveDialog(suggested);
    if (!path) return;
    const text = tab.document.toFileText();
    const previous = tab.source;
    if (previous.kind === 'draft') {
      await api.promoteDraft(previous.id, path, text);
    } else {
      await api.writeFile(path, text);
      await api.unwatchFile(previous.path);
    }
    tab.retarget({ kind: 'file', path }, text);
    await api.watchFile(path);
    await api.addRecentFile(path);
    await this.saveSession();
  }

  async closeTab(tab: DocumentTab): Promise<void> {
    const api = window.markpad;
    if (tab.source.kind === 'draft' && !tab.isEmpty) {
      this.activate(tab);
      const choice = await api.ask({
        message: `Do you want to keep "${tab.title}"?`,
        detail: 'This document has never been saved to a file.',
        buttons: ['Save as...', 'Delete', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
      });
      if (choice === 2) return;
      if (choice === 0) {
        await this.saveAs(tab);
        if (tab.source.kind === 'draft') return;
      }
    }
    await tab.flush();
    if (tab.source.kind === 'draft') {
      await api.deleteDraft(tab.source.id);
    } else {
      await api.unwatchFile(tab.source.path);
    }
    const index = this.tabs.indexOf(tab);
    this.tabs.splice(index, 1);
    await tab.destroy();
    if (this.active === tab) {
      this.active = null;
      const next = this.tabs[Math.min(index, this.tabs.length - 1)];
      if (next) this.activate(next);
    }
    if (this.tabs.length === 0) await this.newDraft();
    this.renderTabBar();
    await this.saveSession();
  }

  activate(tab: DocumentTab): void {
    if (this.active === tab) return;
    this.active?.pane.classList.remove('active');
    this.active = tab;
    tab.pane.classList.add('active');
    this.renderTabBar();
    this.renderChrome();
    const view = tab.document.editor.view;
    this.refreshToolbar(view);
    view.focus();
    void this.saveSession();
  }

  async flushAll(): Promise<void> {
    await Promise.all(this.tabs.map((tab) => tab.flush()));
    await this.saveSession();
  }

  async runMenuAction(action: MenuAction): Promise<void> {
    const tab = this.active;
    switch (action) {
      case 'new':
        return this.newDraft();
      case 'open':
        return this.openWithDialog();
      case 'save-as':
        return tab ? this.saveAs(tab) : undefined;
      case 'close-tab':
        return tab ? this.closeTab(tab) : undefined;
      case 'next-tab':
      case 'previous-tab':
        return this.cycleTabs(action === 'next-tab' ? 1 : -1);
      case 'undo':
        tab?.document.editor.editor.action(callCommand(undoCommand.key));
        return;
      case 'redo':
        tab?.document.editor.editor.action(callCommand(redoCommand.key));
        return;
      case 'toggle-front-matter':
        tab?.toggleFrontMatter();
        return;
      case 'find':
      case 'replace':
      case 'toggle-source':
      case 'toggle-outline':
      case 'export-html':
      case 'export-pdf':
        // Later plan steps add these features.
        return;
    }
  }

  private async runToolbarCommand(command: ToolbarCommand): Promise<void> {
    switch (command) {
      case 'find':
        return this.runMenuAction('find');
      case 'toggle-outline':
        return this.runMenuAction('toggle-outline');
      case 'toggle-source':
        return this.runMenuAction('toggle-source');
      case 'insert-image':
        return this.insertImageFromDialog();
    }
  }

  /** Opens a link from a document: web links in the browser, Markdown files in a tab. */
  openLink(tab: DocumentTab, href: string): void {
    const target = resolveLink(href, tab.source.path);
    switch (target.kind) {
      case 'web':
        window.open(target.url);
        return;
      case 'anchor': {
        const headings = tab.pane.querySelectorAll<HTMLElement>(
          '.ProseMirror :is(h1,h2,h3,h4,h5,h6)',
        );
        const match = [...headings].find(
          (h) => h.id === target.id || h.id === target.id.toLowerCase(),
        );
        match?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      case 'markdown':
        void this.openPaths([target.path]);
        return;
      case 'file':
        void window.markpad.showInFolder(target.path);
        return;
    }
  }

  private async insertImageFromDialog(): Promise<void> {
    const tab = this.active;
    if (!tab) return;
    const api = window.markpad;
    const path = await api.showOpenImageDialog();
    if (!path) return;
    try {
      const src = await api.importImageFile(tab.source.path, path);
      const alt = (path.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '');
      insertImageAtSelection(tab.document.editor.view, src, alt);
    } catch (error) {
      this.onSaveError(tab, error);
    }
  }

  private refreshToolbar(view: EditorView): void {
    this.toolbar.refresh(getFormatState(view.state), { source: false, outline: false });
    this.contextBar.refresh(view);
    this.linkBubble.refresh(view);
  }

  private cycleTabs(step: number): void {
    if (!this.active || this.tabs.length < 2) return;
    const index = this.tabs.indexOf(this.active);
    const next = this.tabs[(index + step + this.tabs.length) % this.tabs.length];
    if (next) this.activate(next);
  }

  private async restoreTab(entry: SessionTab): Promise<void> {
    try {
      if (entry.kind === 'file') {
        const file = await window.markpad.readFile(entry.path);
        await this.addTab({ kind: 'file', path: entry.path }, file.text, false);
      } else {
        const draft = await window.markpad.readDraft(entry.id);
        await this.addTab({ kind: 'draft', id: draft.id, path: draft.path }, draft.text, false);
      }
    } catch {
      // The file was moved or deleted since the last session.
    }
  }

  private async addTab(source: TabSource, text: string, activate = true): Promise<DocumentTab> {
    const tab = await DocumentTab.create(source, text, this);
    this.tabs.push(tab);
    this.documents.append(tab.pane);
    if (source.kind === 'file') await window.markpad.watchFile(source.path);
    if (activate || !this.active) this.activate(tab);
    this.renderTabBar();
    return tab;
  }

  private async handleOutsideChange(snapshot: FileSnapshot): Promise<void> {
    const tab = this.tabs.find((t) => t.source.kind === 'file' && t.source.path === snapshot.path);
    if (!tab || !tab.differsFromSaved(snapshot.text)) return;
    if (!tab.hasPendingSave) {
      await tab.reload(snapshot.text);
      return;
    }
    this.activate(tab);
    const choice = await window.markpad.ask({
      message: `${tab.title} changed on disk.`,
      detail: 'Another program changed this file while you had unsaved edits.',
      buttons: ['Keep my version', 'Load the disk version'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) {
      await tab.reload(snapshot.text);
    } else {
      await tab.flush();
    }
  }

  private async saveSession(): Promise<void> {
    const activeIndex = this.active ? this.tabs.indexOf(this.active) : 0;
    await window.markpad.saveSession({
      tabs: this.tabs.map((tab) => tab.sessionEntry),
      activeIndex: Math.max(activeIndex, 0),
    });
  }

  private renderTabBar(): void {
    const items = this.tabs.map((tab) => {
      const item = document.createElement('div');
      item.className = 'tab';
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', String(tab === this.active));
      item.title = tab.source.kind === 'file' ? tab.source.path : 'Untitled document';
      item.classList.toggle('pending', tab.hasPendingSave);
      item.classList.toggle('draft', tab.source.kind === 'draft');

      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = tab.title;
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.setAttribute('aria-label', `Close ${tab.title}`);
      close.textContent = '×';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.closeTab(tab);
      });

      item.addEventListener('mousedown', (event) => {
        if (event.button === 1) {
          event.preventDefault();
          void this.closeTab(tab);
        } else if (event.button === 0) {
          this.activate(tab);
        }
      });
      item.append(label, close);
      return item;
    });
    this.tabBar.replaceChildren(...items);
  }

  /** Updates the window title and status bar for the active tab. */
  private renderChrome(): void {
    const tab = this.active;
    if (!tab) return;
    document.title = `${tab.title} - Markpad`;
    delete this.statusBar.dataset['error'];
    const where = tab.source.kind === 'file' ? tab.source.path : 'Not saved to a file';
    const state = tab.hasPendingSave ? 'Saving...' : 'Saved';
    this.setStatus(`${where}  |  ${tab.source.kind === 'file' ? state : 'Draft'}`);
  }

  private setStatus(text: string): void {
    const path = this.statusBar.querySelector('.status-path');
    if (path) path.textContent = text;
  }
}
