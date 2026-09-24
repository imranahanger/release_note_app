const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  loadSample: () => ipcRenderer.invoke('load-sample'),
  chooseLogo: () => ipcRenderer.invoke('choose-logo'),
  openJson: () => ipcRenderer.invoke('open-json'),
  saveJson: (release) => ipcRenderer.invoke('save-json', release),
  exportPdf: (release) => ipcRenderer.invoke('export-pdf', release),
  onMenu: (callback) => ipcRenderer.on('menu', (_event, action) => callback(action)),
});
