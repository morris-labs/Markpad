import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import type { MenuAction, ThemeSetting } from '@shared/api';

/** Callbacks that the application menu invokes. */
export interface MenuHandlers {
  readonly send: (action: MenuAction) => void;
  readonly openRecent: (path: string) => void;
  readonly clearRecent: () => void;
  readonly setTheme: (theme: ThemeSetting) => void;
  readonly installCommand: () => void;
  readonly uninstallCommand: () => void;
}

/** Builds and installs the application menu. */
export function installMenu(
  handlers: MenuHandlers,
  recent: readonly string[],
  theme: ThemeSetting,
): void {
  const isMac = process.platform === 'darwin';
  const action = (
    label: string,
    command: MenuAction,
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => handlers.send(command),
  });
  const themeItem = (label: string, value: ThemeSetting): MenuItemConstructorOptions => ({
    label,
    type: 'radio',
    checked: theme === value,
    click: () => handlers.setTheme(value),
  });

  const recentItems: MenuItemConstructorOptions[] =
    recent.length === 0
      ? [{ label: 'No recent files', enabled: false }]
      : [
          ...recent.map((path) => ({ label: path, click: () => handlers.openRecent(path) })),
          { type: 'separator' },
          { label: 'Clear recent files', click: handlers.clearRecent },
        ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: '&File',
      submenu: [
        action('New', 'new', 'CmdOrCtrl+N'),
        action('Open...', 'open', 'CmdOrCtrl+O'),
        action('Open path...', 'open-path', 'CmdOrCtrl+L'),
        { label: 'Open recent', submenu: recentItems },
        { type: 'separator' },
        action('Save as...', 'save-as', 'CmdOrCtrl+Shift+S'),
        {
          label: 'Export',
          submenu: [action('HTML...', 'export-html'), action('PDF...', 'export-pdf')],
        },
        action('Print...', 'print', 'CmdOrCtrl+P'),
        { type: 'separator' },
        action('Close tab', 'close-tab', 'CmdOrCtrl+W'),
        ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'quit' } as const]),
      ],
    },
    {
      label: '&Edit',
      submenu: [
        action('Undo', 'undo', 'CmdOrCtrl+Z'),
        action('Redo', 'redo', isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        action('Copy as HTML', 'copy-html', 'CmdOrCtrl+Shift+C'),
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        action('Find...', 'find', 'CmdOrCtrl+F'),
        action('Replace...', 'replace', isMac ? 'Alt+Cmd+F' : 'Ctrl+H'),
      ],
    },
    {
      label: '&View',
      submenu: [
        action('Markdown source', 'toggle-source', 'CmdOrCtrl+/'),
        action('Outline', 'toggle-outline', 'CmdOrCtrl+Shift+O'),
        action('Front matter', 'toggle-front-matter'),
        { type: 'separator' },
        action('Next tab', 'next-tab', 'Ctrl+Tab'),
        action('Previous tab', 'previous-tab', 'Ctrl+Shift+Tab'),
        { type: 'separator' },
        {
          label: 'Theme',
          submenu: [
            themeItem('Follow system', 'system'),
            themeItem('Light', 'light'),
            themeItem('Dark', 'dark'),
          ],
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' } as const]),
      ],
    },
    ...(isMac ? [{ role: 'windowMenu' } as MenuItemConstructorOptions] : []),
    {
      label: '&Help',
      role: 'help',
      submenu: [
        { label: "Install 'mpd' command", click: handlers.installCommand },
        { label: "Remove 'mpd' command", click: handlers.uninstallCommand },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
