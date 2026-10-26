import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

const MAX_SUGGESTIONS = 6;

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
