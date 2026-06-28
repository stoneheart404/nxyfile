const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const hosting = require('./hosting');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  hosting.stopAllProcesses();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  hosting.stopAllProcesses();
});

ipcMain.handle('get-projects', () => {
  const projects = hosting.scanProjects();
  const statuses = hosting.getAllStatuses();
  return projects.map(p => ({ ...p, status: statuses[p.path] || null }));
});

ipcMain.handle('start-process', async (event, projectPath, commandId) => {
  try {
    await hosting.startProcess(projectPath, commandId);
    return { success: true, status: hosting.getProcessStatus(projectPath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-process', async (event, projectPath) => {
  try {
    await hosting.stopProcess(projectPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-status', (event, projectPath) => hosting.getProcessStatus(projectPath));

ipcMain.handle('get-logs', (event, projectPath, since) => hosting.getProcessLogs(projectPath, since));

ipcMain.handle('open-browser', (event, url) => {
  shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('open-folder', (event, folderPath) => {
  shell.openPath(folderPath);
  return { success: true };
});
