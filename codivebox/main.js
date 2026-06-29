const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

let mainWindow;
let liveServer = null;
let livePort = 0;
let folderWatcher = null;
let watchedFolder = null;

// ─── Config file path ────────────────────────────────────────────────────────
const configPath = path.join(__dirname, "config.json");

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("readConfig error:", e.message);
    return {};
  }
}

function writeConfig(cfg) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
    return true;
  } catch (e) {
    console.error("writeConfig error:", e.message);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 500,
    title: "CodiveBox",
    backgroundColor: "#000000",
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("index.html");

  ipcMain.on("win-minimize", () => mainWindow.minimize());
  ipcMain.on("win-maximize", () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("win-close", () => mainWindow.close());

  mainWindow.on("maximize", () => mainWindow.webContents.send("win-maximized", true));
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("win-maximized", false));

  // Go Live — start a tiny HTTP static server and open in system browser
  ipcMain.handle("go-live", async (event, rootPath, relPath) => {
    try {
      const result = await startLiveServer(rootPath, relPath);
      return result;
    } catch (err) {
      console.error("go-live error:", err);
      return { success: false, error: err.message };
    }
  });

  // Open folder dialog
  ipcMain.handle("open-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (!result.canceled && result.filePaths[0]) {
      const dir = result.filePaths[0];
      const files = [];
      walkDir(dir, files, dir);
      watchFolder(dir);
      return { path: dir, files };
    }
    return null;
  });

  // Reopen a specific folder path (recent projects)
  ipcMain.handle("open-folder-path", async (event, dir) => {
    if (!dir || !fs.existsSync(dir)) return null;
    const files = [];
    walkDir(dir, files, dir);
    watchFolder(dir);
    return { path: dir, files };
  });

  // Config read/write via IPC
  ipcMain.handle("read-config", async () => {
    return readConfig();
  });
  ipcMain.handle("write-config", async (event, cfg) => {
    const ok = writeConfig(cfg);
    return { success: ok };
  });

  // Disk file operations (return success for confirmation)
  ipcMain.on("save-file-disk", (event, filePath, content) => {
    try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, content, "utf-8");
      event.reply("save-file-disk-result", { success: true, path: filePath });
    }
    catch (e) { console.error("save-file-disk error:", e.message);
      event.reply("save-file-disk-result", { success: false, error: e.message });
    }
  });
  ipcMain.on("create-folder-disk", (event, folderPath) => {
    try { fs.mkdirSync(folderPath, { recursive: true }); }
    catch (e) { console.error("create-folder-disk error:", e.message); }
  });
  ipcMain.on("delete-file-disk", (event, targetPath) => {
    try {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) fs.rmSync(targetPath, { recursive: true, force: true });
      else fs.unlinkSync(targetPath);
    } catch (e) { console.error("delete-file-disk error:", e.message); }
  });
  ipcMain.on("rename-file-disk", (event, oldPath, newPath) => {
    try { fs.mkdirSync(path.dirname(newPath), { recursive: true }); fs.renameSync(oldPath, newPath); }
    catch (e) { console.error("rename-file-disk error:", e.message); }
  });

  ipcMain.on("reveal-in-explorer", (event, filePath) => {
    try { shell.showItemInFolder(filePath); } catch(e) {}
  });

  // Terminal: spawn shell and pipe I/O
  let termProc = null;
  ipcMain.on("term-start", () => {
    if (termProc) { try { termProc.kill(); } catch(e) {} }
    const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
    termProc = spawn(shell, [], {
      cwd: process.cwd(),
      env: { ...process.env, TERM: "xterm-256color" },
    });
    termProc.stdout.on("data", (data) => {
      if (mainWindow) mainWindow.webContents.send("term-data", data.toString());
    });
    termProc.stderr.on("data", (data) => {
      if (mainWindow) mainWindow.webContents.send("term-data", data.toString());
    });
    termProc.on("exit", () => {
      if (mainWindow) mainWindow.webContents.send("term-data", "\r\n[Terminal exited]\r\n");
      termProc = null;
    });
  });
  ipcMain.on("term-input", (event, data) => {
    if (termProc) termProc.stdin.write(data);
  });
  ipcMain.on("term-resize", (event, cols, rows) => {
    if (termProc && termProc.stdin.writable) {
      termProc.stdin.write(`\x1b[8;${rows};${cols}t`);
      try { termProc.kill("SIGWINCH"); } catch(e) {}
    }
  });
  ipcMain.on("term-stop", () => {
    if (termProc) { try { termProc.kill(); } catch(e) {} termProc = null; }
  });

  Menu.setApplicationMenu(null);
  mainWindow.on("closed", () => { mainWindow = null; });
}

function startLiveServer(rootPath, relPath) {
  return new Promise((resolve, reject) => {
    // Stop any previous server
    if (liveServer) {
      try { liveServer.close(); } catch(e) {}
      liveServer = null;
    }

    const normalizedRoot = path.resolve(rootPath);

    liveServer = http.createServer((req, res) => {
      let reqPath = decodeURIComponent(req.url.split("?")[0]);
      if (reqPath === "/") reqPath = "/" + (relPath || "index.html");
      const filePath = path.join(normalizedRoot, reqPath);

      // Security: prevent directory traversal outside root
      if (!filePath.startsWith(normalizedRoot) && filePath !== normalizedRoot) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found: " + reqPath);
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = {
          ".html": "text/html", ".htm": "text/html",
          ".css": "text/css",
          ".js": "text/javascript", ".mjs": "text/javascript",
          ".json": "application/json",
          ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".gif": "image/gif", ".svg": "image/svg+xml",
          ".ico": "image/x-icon",
          ".woff": "font/woff", ".woff2": "font/woff2",
          ".ttf": "font/ttf", ".otf": "font/otf",
          ".mp4": "video/mp4", ".webm": "video/webm",
          ".mp3": "audio/mpeg", ".wav": "audio/wav",
        }[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime, "Access-Control-Allow-Origin": "*" });
        res.end(data);
      });
    });

    liveServer.on("error", (err) => {
      reject(err);
    });

    liveServer.listen(0, "127.0.0.1", () => {
      livePort = liveServer.address().port;
      const rel = (relPath || "").replace(/\\/g, "/");
      const url = "http://127.0.0.1:" + livePort + "/" + rel;

      // Open in system default browser
      shell.openExternal(url).catch(e => console.error("openExternal failed:", e));

      if (mainWindow) {
        mainWindow.webContents.send("live-server-started", { port: livePort, url });
      }

      resolve({ success: true, port: livePort, url });
    });
  });
}

function watchFolder(dir) {
  if (folderWatcher) { try { folderWatcher.close(); } catch(e) {} folderWatcher = null; }
  watchedFolder = dir;
  if (!dir) return;
  try {
    folderWatcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename || filename.startsWith(".") || filename.includes("node_modules")) return;
      const full = path.join(dir, filename);
      if (!fs.existsSync(full)) {
        mainWindow?.webContents.send("folder-file-removed", path.relative(dir, full).replace(/\\/g, "/"));
        return;
      }
      const stat = fs.statSync(full, { throwIfNoEntry: false });
      if (!stat || stat.isDirectory()) return;
      try {
        const content = fs.readFileSync(full, "utf-8");
        mainWindow?.webContents.send("folder-file-changed", path.relative(dir, full).replace(/\\/g, "/"), content);
      } catch (e) { /* binary or locked */ }
    });
  } catch (e) { console.error("watchFolder error:", e.message); }
}

function walkDir(dir, files, root) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") walkDir(full, files, root);
    } else {
      try {
        const content = fs.readFileSync(full, "utf-8");
        const rel = path.relative(root, full);
        files.push({ name: rel, path: full, content, language: getLang(rel) });
      } catch (e) { /* binary file, skip */ }
    }
  }
}

function getLang(name) {
  const ext = path.extname(name).slice(1);
  const map = { py: "python", js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript", html: "html", css: "css", json: "json", md: "markdown", txt: "text", sql: "sql", sh: "bash", bash: "bash", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", svg: "xml" };
  return map[ext] || "text";
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
