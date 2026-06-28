const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  startProcess: (projectPath, commandId) => ipcRenderer.invoke('start-process', projectPath, commandId),
  stopProcess: (projectPath) => ipcRenderer.invoke('stop-process', projectPath),
  getStatus: (projectPath) => ipcRenderer.invoke('get-status', projectPath),
  getLogs: (projectPath, since) => ipcRenderer.invoke('get-logs', projectPath, since),
  openBrowser: (url) => ipcRenderer.invoke('open-browser', url),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
});
