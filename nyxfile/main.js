const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const os = require('os')

let mainWindow

// macOS application menu
if (process.platform === 'darwin') {
  const template = [
    {
      label: 'Nyxfile',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder...', accelerator: 'Cmd+O', click: () => mainWindow?.webContents.send('menu:openFolder') },
        { label: 'Open Recent', role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      role: 'help',
      submenu: []
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    frame: false, backgroundColor: '#000000',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window:close', () => mainWindow.close())
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ─── File System IPC ───
async function getFileInfo(fullPath, entry, baseDir) {
  try {
    const stats = await fs.promises.stat(fullPath)
    return {
      name: entry ? entry.name : path.basename(fullPath),
      path: fullPath,
      isDirectory: entry ? entry.isDirectory() : stats.isDirectory(),
      size: stats.size,
      created: stats.birthtime?.toISOString() || null,
      modified: stats.mtime?.toISOString() || null,
      ext: path.extname(fullPath).toLowerCase()
    }
  } catch (e) {
    return {
      name: path.basename(fullPath),
      path: fullPath,
      isDirectory: false, size: 0,
      created: null, modified: null,
      ext: path.extname(fullPath).toLowerCase()
    }
  }
}

ipcMain.handle('fs:scan', async (event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const files = await Promise.all(entries.map(e => getFileInfo(path.join(dirPath, e.name), e)))
    return { success: true, files, dirPath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Recursive scan with depth limit
ipcMain.handle('fs:scanRecursive', async (event, dirPath, maxDepth = 3, maxFiles = 5000) => {
  try {
    const allFiles = []
    async function walk(dir, depth) {
      if (depth > maxDepth || allFiles.length >= maxFiles) return
      let entries
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch (e) { return }
      for (const entry of entries) {
        if (allFiles.length >= maxFiles) break
        const fullPath = path.join(dir, entry.name)
        const info = await getFileInfo(fullPath, entry)
        info.depth = depth
        allFiles.push(info)
        if (entry.isDirectory() && depth < maxDepth) {
          await walk(fullPath, depth + 1)
        }
      }
    }
    await walk(dirPath, 0)
    return { success: true, files: allFiles, dirPath, total: allFiles.length }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Search files by name pattern
ipcMain.handle('fs:search', async (event, dirPath, pattern, maxDepth = 5) => {
  try {
    const results = []
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i')
    async function walk(dir, depth) {
      if (depth > maxDepth || results.length >= 1000) return
      let entries
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch (e) { return }
      for (const entry of entries) {
        if (results.length >= 1000) break
        if (regex.test(entry.name)) {
          const info = await getFileInfo(path.join(dir, entry.name), entry)
          results.push(info)
        }
        if (entry.isDirectory() && depth < maxDepth) {
          await walk(path.join(dir, entry.name), depth + 1)
        }
      }
    }
    await walk(dirPath, 0)
    return { success: true, files: results, dirPath, total: results.length }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Get system drives / root paths
ipcMain.handle('fs:drives', async () => {
  try {
    if (process.platform === 'win32') {
      const drives = []
      for (let c = 65; c <= 90; c++) {
        const letter = String.fromCharCode(c)
        const p = `${letter}:\\`
        if (fs.existsSync(p)) drives.push({ name: `${letter}:`, path: p, isDirectory: true, size: 0, ext: '' })
      }
      return { success: true, files: drives, dirPath: 'This PC' }
    } else {
      const home = os.homedir()
      const roots = [
        { name: 'Root', path: '/', isDirectory: true, size: 0, ext: '' },
        { name: 'Home', path: home, isDirectory: true, size: 0, ext: '' },
        { name: 'Desktop', path: path.join(home, 'Desktop'), isDirectory: true, size: 0, ext: '' },
        { name: 'Documents', path: path.join(home, 'Documents'), isDirectory: true, size: 0, ext: '' },
        { name: 'Downloads', path: path.join(home, 'Downloads'), isDirectory: true, size: 0, ext: '' }
      ].filter(r => fs.existsSync(r.path))
      return { success: true, files: roots, dirPath: 'System' }
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Get parent directory path
ipcMain.handle('fs:parent', async (event, dirPath) => {
  const parent = path.dirname(dirPath)
  return parent !== dirPath ? parent : null
})

ipcMain.handle('fs:read', async (event, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const textExts = ['.txt','.md','.json','.js','.ts','.html','.css','.py','.xml','.csv','.log','.yaml','.yml','.ini','.cfg','.env','.sh','.bat','.ps1','.java','.c','.cpp','.h','.rb','.go','.rs','.php','.sql','.rtf','.swift','.kt','.toml']
    const imageExts = ['.png','.jpg','.jpeg','.gif','.bmp','.webp','.svg','.ico']
    let content = null, previewType = 'binary'

    if (imageExts.includes(ext)) {
      const buffer = await fs.promises.readFile(filePath)
      content = buffer.toString('base64')
      previewType = 'image'
    } else if (textExts.includes(ext) || stats.size < 512000) {
      try {
        content = await fs.promises.readFile(filePath, 'utf8')
        previewType = 'text'
      } catch (e) {
        const buffer = await fs.promises.readFile(filePath)
        content = buffer.toString('base64')
      }
    } else {
      previewType = 'unsupported'
    }
    return { success: true, content, previewType, name: path.basename(filePath), size: stats.size, ext, modified: stats.mtime.toISOString() }
  } catch (e) {
    return { success: false, error: e.message, previewType: 'error' }
  }
})

ipcMain.handle('fs:delete', async (event, filePath) => {
  try { await shell.trashItem(filePath); return { success: true } } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:move', async (event, source, dest) => {
  try {
    const destDir = path.dirname(dest)
    if (!fs.existsSync(destDir)) await fs.promises.mkdir(destDir, { recursive: true })
    await fs.promises.rename(source, dest)
    return { success: true }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:copy', async (event, source, dest) => {
  try {
    const destDir = path.dirname(dest)
    if (!fs.existsSync(destDir)) await fs.promises.mkdir(destDir, { recursive: true })
    await fs.promises.copyFile(source, dest)
    return { success: true }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:mkdir', async (event, dirPath) => {
  try { await fs.promises.mkdir(dirPath, { recursive: true }); return { success: true } } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
  try { await fs.promises.rename(oldPath, newPath); return { success: true } } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:openExplorer', async (event, filePath) => {
  shell.showItemInFolder(filePath)
  return { success: true }
})

ipcMain.handle('dialog:selectDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('fs:hash', async (event, filePath) => {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (data) => hash.update(data))
    stream.on('end', () => resolve({ success: true, hash: hash.digest('hex') }))
    stream.on('error', (e) => resolve({ success: false, error: e.message }))
  })
})

ipcMain.handle('fs:findDuplicates', async (event, dirPath) => {
  try {
    const hashMap = new Map(); const duplicates = []
    async function walk(dir) {
      let entries
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch (e) { return }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) { await walk(fullPath) } else {
          try {
            const result = await new Promise((resolve) => {
              const hash = crypto.createHash('sha256')
              const stream = fs.createReadStream(fullPath)
              stream.on('data', (d) => hash.update(d))
              stream.on('end', () => resolve(hash.digest('hex')))
              stream.on('error', () => resolve(null))
            })
            if (result) {
              if (hashMap.has(result)) duplicates.push({ original: hashMap.get(result), duplicate: fullPath })
              else hashMap.set(result, fullPath)
            }
          } catch (e) {}
        }
      }
    }
    await walk(dirPath)
    return { success: true, duplicates }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:exists', async (event, filePath) => { return fs.existsSync(filePath) })

// ─── AI ───
const { chat: openaiChat, chatStream: openaiStream } = require('./ai/openai')
const { chat: anthropicChat, chatStream: anthropicStream } = require('./ai/anthropic')
const { chat: ollamaChat, chatStream: ollamaStream, listModels: ollamaList } = require('./ai/ollama')
const { chat: customChat, chatStream: customStream } = require('./ai/custom')

ipcMain.handle('ai:openai', async (event, messages, apiKey, model) => {
  try { const r = await openaiChat(messages, apiKey, model); return { success: true, content: r } } catch (e) { return { success: false, error: e.message } }
})
ipcMain.handle('ai:anthropic', async (event, messages, apiKey, model) => {
  try { const r = await anthropicChat(messages, apiKey, model); return { success: true, content: r } } catch (e) { return { success: false, error: e.message } }
})
ipcMain.handle('ai:ollama', async (event, messages, model) => {
  try { const r = await ollamaChat(messages, model); return { success: true, content: r } } catch (e) { return { success: false, error: e.message } }
})
ipcMain.handle('ai:custom', async (event, messages, apiKey, baseURL, model) => {
  try { const r = await customChat(messages, apiKey, baseURL, model); return { success: true, content: r } } catch (e) { return { success: false, error: e.message } }
})

// Streaming AI
ipcMain.on('ai:stream', (event, params) => {
  try {
    const sender = event.sender
    if (sender.isDestroyed()) return

    const { provider, messages, apiKey, model, baseURL } = params || {}
    if (!provider || !messages) {
      sender.send('ai:done', { success: false, content: null, error: 'Missing provider or messages' })
      return
    }

    let fullContent = ''
    const onChunk = (text) => {
      if (sender.isDestroyed()) return
      fullContent += text
      sender.send('ai:chunk', { text })
    }
    const onDone = (success, content, error) => {
      if (sender.isDestroyed()) return
      sender.send('ai:done', { success, content: content || fullContent, error })
    }

    ;(async () => {
      try {
        switch (provider) {
          case 'openai':
            await openaiStream(messages, apiKey, model, onChunk); onDone(true); break
          case 'anthropic':
            await anthropicStream(messages, apiKey, model, onChunk); onDone(true); break
          case 'ollama':
            await ollamaStream(messages, model, onChunk); onDone(true); break
          case 'opencode':
          case 'openrouter':
          case 'deepseek':
          case 'groq':
          case 'custom':
            await customStream(messages, apiKey, baseURL, model, onChunk); onDone(true); break
          default:
            onDone(false, null, `Unknown provider: ${provider}`)
        }
      } catch (e) {
        onDone(false, fullContent, e.message)
      }
    })()
  } catch (e) {
    try { event.sender.send('ai:done', { success: false, content: null, error: e.message }) } catch (e2) {}
  }
})

ipcMain.handle('ai:ollamaList', async () => {
  try { const m = await ollamaList(); return { success: true, models: m } } catch (e) { return { success: false, error: e.message } }
})
