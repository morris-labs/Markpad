import { contextBridge, ipcRenderer } from 'electron';
import type { MarkpadApi } from '@shared/api';

const api: MarkpadApi = {
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
};

contextBridge.exposeInMainWorld('markpad', api);
