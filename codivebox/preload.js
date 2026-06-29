const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codivebox", {
  // Menu events
  onMenuAction: (channel, callback) => {
    const valid = [
      "menu-new-file", "menu-save", "menu-find", "menu-replace",
      "menu-toggle-sidebar", "menu-toggle-output", "menu-run", "menu-split",
      "workspace-opened", "win-maximized", "live-server-started", "term-data",
      "save-file-disk-result", "folder-file-changed", "folder-file-removed"
    ];
    if (valid.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  // Window controls
  minimize: () => ipcRenderer.send("win-minimize"),
  maximize: () => ipcRenderer.send("win-maximize"),
  close: () => ipcRenderer.send("win-close"),
  // File dialogs
  openFolder: () => ipcRenderer.invoke("open-folder"),
  openFolderPath: (dir) => ipcRenderer.invoke("open-folder-path", dir),
  // Go Live — start preview server and return URL
  goLive: (rootPath, relPath) => ipcRenderer.invoke("go-live", rootPath, relPath),
  // Config read/write
  readConfig: () => ipcRenderer.invoke("read-config"),
  writeConfig: (cfg) => ipcRenderer.invoke("write-config", cfg),
  // Disk file operations
  saveFileDisk: (filePath, content) => ipcRenderer.send("save-file-disk", filePath, content),
  createFolderDisk: (folderPath) => ipcRenderer.send("create-folder-disk", folderPath),
  deleteFileDisk: (targetPath) => ipcRenderer.send("delete-file-disk", targetPath),
  renameFileDisk: (oldPath, newPath) => ipcRenderer.send("rename-file-disk", oldPath, newPath),
  // Terminal
  termStart: () => ipcRenderer.send("term-start"),
  termInput: (data) => ipcRenderer.send("term-input", data),
  termResize: (cols, rows) => ipcRenderer.send("term-resize", cols, rows),
  termStop: () => ipcRenderer.send("term-stop"),
  // Reveal in file explorer
  revealInExplorer: (filePath) => ipcRenderer.send("reveal-in-explorer", filePath),
  // Platform info
  platform: process.platform,
});
