const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  scanDir: (dirPath) => ipcRenderer.invoke('fs:scan', dirPath),
  scanRecursive: (dirPath, maxDepth) => ipcRenderer.invoke('fs:scanRecursive', dirPath, maxDepth),
  searchFiles: (dirPath, pattern, maxDepth) => ipcRenderer.invoke('fs:search', dirPath, pattern, maxDepth),
  getDrives: () => ipcRenderer.invoke('fs:drives'),
  getParent: (dirPath) => ipcRenderer.invoke('fs:parent', dirPath),

  readFile: (filePath) => ipcRenderer.invoke('fs:read', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:delete', filePath),
  moveFile: (source, dest) => ipcRenderer.invoke('fs:move', source, dest),
  copyFile: (source, dest) => ipcRenderer.invoke('fs:copy', source, dest),
  mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  openExplorer: (filePath) => ipcRenderer.invoke('fs:openExplorer', filePath),
  getHash: (filePath) => ipcRenderer.invoke('fs:hash', filePath),
  findDuplicates: (dirPath) => ipcRenderer.invoke('fs:findDuplicates', dirPath),
  fileExists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),

  selectDir: () => ipcRenderer.invoke('dialog:selectDir'),

  aiChat: (messages, apiKey, model) => ipcRenderer.invoke('ai:openai', messages, apiKey, model),
  aiAnthropic: (messages, apiKey, model) => ipcRenderer.invoke('ai:anthropic', messages, apiKey, model),
  aiOllama: (messages, model) => ipcRenderer.invoke('ai:ollama', messages, model),
  aiCustom: (messages, apiKey, baseURL, model) => ipcRenderer.invoke('ai:custom', messages, apiKey, baseURL, model),
  aiOllamaList: () => ipcRenderer.invoke('ai:ollamaList'),

  // Streaming AI
  aiStream: (params) => ipcRenderer.send('ai:stream', params),
  onAiChunk: (cb) => ipcRenderer.on('ai:chunk', (event, data) => cb(data)),
  onAiDone: (cb) => ipcRenderer.on('ai:done', (event, data) => cb(data)),
  removeAiListeners: () => {
    ipcRenderer.removeAllListeners('ai:chunk')
    ipcRenderer.removeAllListeners('ai:done')
  }
})
