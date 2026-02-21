const { contextBridge, ipcRenderer } = require('electron');

const DEFAULT_PORT = 8000;

window.addEventListener('DOMContentLoaded', () => {
  if (typeof window.API_PORT === 'undefined' || Number.isNaN(Number(window.API_PORT))) {
    window.API_PORT = DEFAULT_PORT;
    console.warn(`[preload] API_PORT was undefined, fallback to ${DEFAULT_PORT}`);
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  getApiUrl: () => ipcRenderer.invoke('get-api-url'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  downloadModel: (payload) => ipcRenderer.invoke('download-model', payload),
  downloadAllModels: (tasks) => ipcRenderer.invoke('download-models-all', { tasks }),
  deleteModel: (payload) => ipcRenderer.invoke('delete-model', payload),
  onDownloadProgress: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  onModelStatusChanged: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('model-status-changed', handler);
    return () => ipcRenderer.removeListener('model-status-changed', handler);
  },
});
