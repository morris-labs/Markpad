import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { TabMenuAction } from '@shared/api';

const MAX_SUGGESTIONS = 6;
const DISMISS_DELAY_MS = 200;

/** Shows spelling suggestions and the clipboard actions on right-click. */
export function installContextMenu(win: BrowserWindow): void {
  const contents = win.webContents;
  contents.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = [];
    if (params.misspelledWord) {
      const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS);
      if (suggestions.length === 0) {
        items.push({ label: 'No suggestions', enabled: false });
      }
      for (const suggestion of suggestions) {
        items.push({
          label: suggestion,
          click: () => contents.replaceMisspelling(suggestion),
        });
      }
      items.push(
        { type: 'separator' },
        {
          label: 'Add to dictionary',
          click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: 'separator' },
      );
    }
    if (params.isEditable) {
      items.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        // Form fields such as the find bar hold plain text, so only the editor offers HTML.
        ...(params.formControlType === 'none'
          ? [
              {
                label: params.selectionText ? 'Copy as HTML' : 'Copy all as HTML',
                click: () => contents.send('menu:action', 'copy-html'),
              },
            ]
          : []),
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' },
      );
    } else if (params.selectionText) {
      items.push({ role: 'copy' });
    }
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: win });
  });
}

/** Shows the menu for a tab and resolves with the chosen command, or null if dismissed. */
export function showTabMenu(
  win: BrowserWindow,
  enabled: readonly TabMenuAction[],
): Promise<TabMenuAction | null> {
  return new Promise((done) => {
    const item = (label: string, action: TabMenuAction): MenuItemConstructorOptions => ({
      label,
      enabled: enabled.includes(action),
      click: () => done(action),
    });
    Menu.buildFromTemplate([
      item('Close', 'close'),
      item('Close others', 'close-others'),
      item('Close to the left', 'close-left'),
      item('Close to the right', 'close-right'),
      { type: 'separator' },
      item('Close unchanged', 'close-unchanged'),
      item('Close all', 'close-all'),
    ]).popup({
      window: win,
      // On some platforms, the menu reports closing before it reports the click.
      callback: () => setTimeout(() => done(null), DISMISS_DELAY_MS),
    });
  });
}
