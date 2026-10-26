import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { FileSnapshot, MarkpadApi, MenuAction } from '@shared/api';

const api: MarkpadApi = {
  platform: process.platform,

  getStartupState: () => ipcRenderer.invoke('session:startup'),
  saveSession: (session) => ipcRenderer.invoke('session:save', session),

  showOpenDialog: () => ipcRenderer.invoke('dialog:open'),
  showSaveDialog: (suggestedName) => ipcRenderer.invoke('dialog:save', suggestedName),
  ask: (options) => ipcRenderer.invoke('dialog:ask', options),

  showOpenImageDialog: () => ipcRenderer.invoke('dialog:openImage'),
  importImageFile: (documentPath, imagePath) =>
    ipcRenderer.invoke('image:importFile', documentPath, imagePath),
  importImageBytes: (documentPath, image) =>
    ipcRenderer.invoke('image:importBytes', documentPath, image),
  getPathForFile: (file) => webUtils.getPathForFile(file),

  showInFolder: (path) => ipcRenderer.invoke('shell:showInFolder', path),

  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, text) => ipcRenderer.invoke('file:write', path, text),
  watchFile: (path) => ipcRenderer.invoke('file:watch', path),
  unwatchFile: (path) => ipcRenderer.invoke('file:unwatch', path),
  addRecentFile: (path) => ipcRenderer.invoke('file:addRecent', path),

  createDraft: () => ipcRenderer.invoke('draft:create'),
  readDraft: (id) => ipcRenderer.invoke('draft:read', id),
  deleteDraft: (id) => ipcRenderer.invoke('draft:delete', id),
  promoteDraft: (id, path, text) => ipcRenderer.invoke('draft:promote', id, path, text),

  onMenuAction: (listener) => {
    ipcRenderer.on('menu:action', (_event, action: MenuAction) => listener(action));
  },
  onOpenPaths: (listener) => {
    ipcRenderer.on('app:openPaths', (_event, paths: string[]) => listener(paths));
  },
  onFileChanged: (listener) => {
    ipcRenderer.on('file:changed', (_event, snapshot: FileSnapshot) => listener(snapshot));
  },
  onBeforeClose: (handler) => {
    ipcRenderer.on('app:beforeClose', () => {
      void handler()
        .catch((error: unknown) => console.error('Flushing before close failed:', error))
        .finally(() => ipcRenderer.send('app:closeReady'));
    });
  },
};

contextBridge.exposeInMainWorld('markpad', api);
