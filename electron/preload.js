// electron/preload.js
// Exposes a minimal safe bridge from main process to renderer.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
  isElectron: true,
});
