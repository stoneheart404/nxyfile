/* =============================================
   CODIVEBOX — Editor-Centric
   AI is an assistant. User is in control.
   ============================================= */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const sidebar = $("#sidebar");
const sidebarTitle = $("#sidebarTitle");
const sidebarActions = $("#sidebarActions");
const fileTree = $("#fileTree");
const tabsBar = $("#tabsBar");
const editorBreadcrumbs = $("#editorBreadcrumbs");
const editorContainer = $("#editorContainer");
const rightPanel = $("#rightPanel");
const chatMessages = $("#chatMessages");
const chatInput = $("#chatInput");
const chatSendBtn = $("#chatSendBtn");
const outputContent = $("#outputContent");
const bottomPanel = $("#bottomPanel");
const statusConnection = $("#statusConnection");
const statusLanguage = $("#statusLanguage");
const statusLineCol = $("#statusLineCol");
const topSearch = $("#topSearch");
const goLiveBtn = $("#goLiveBtn");
const topProjectName = $("#topProjectName");
const explorerProjectTitle = $("#explorerProjectTitle");

// Settings modal refs
const settingsModal = $("#settingsModal");
const apiUrlInput = $("#apiUrl");
const apiKeyInput = $("#apiKey");
const toggleKeyBtn = $("#toggleKey");
const temperatureSlider = $("#temperature");
const temperatureVal = $("#temperatureVal");
const maxTokensSlider = $("#maxTokens");
const maxTokensVal = $("#maxTokensVal");
const topPSlider = $("#topP");
const topPVal = $("#topPVal");
const systemPromptEl = $("#systemPrompt");
const saveConfigBtn = $("#saveConfigBtn");

// Command palette
const cmdPalette = $("#cmdPalette");
const cmdPaletteInput = $("#cmdPaletteInput");
const cmdPaletteList = $("#cmdPaletteList");

let editor = null;
let editor2 = null;
let isBottomOpen = true;
let messages = [];
let pyodide = null;
let pyodideLoading = false;
let currentSidebar = "explorer";
let currentRightTab = "chat";
let activePane = 1;
let openFiles1 = ["main.py"]; let activeFile1 = "main.py";
let openFiles2 = []; let activeFile2 = null;
let previewFile = null;
let autoSaveMode = localStorage.getItem("codivebox_autosave") || "off"; // off | afterDelay | onFocusChange
let autoSaveTimer = null;

function getEditor(p) { return (p || activePane) === 1 ? editor : editor2; }
function getOpenFiles(p) { return (p || activePane) === 1 ? openFiles1 : openFiles2; }
function getActiveFile(p) { return (p || activePane) === 1 ? activeFile1 : activeFile2; }
function setActiveFile(p, name) { if ((p || activePane) === 1) activeFile1 = name; else activeFile2 = name; }
function allOpenFiles() { return [...new Set([...openFiles1, ...openFiles2])]; }

// ─── Session timer ───────────────────────────────────────────────────────────
let sessionStartTime = Date.now();
setInterval(() => {
  const elapsedMin = Math.floor((Date.now() - sessionStartTime) / 60000);
  const h = Math.floor(elapsedMin / 60), m = elapsedMin % 60;
  let text = ""; if (h > 0) text += h + "h "; if (m > 0 || h === 0) text += m + "m";
  const el = document.getElementById("codingTimerText"); if (el) el.textContent = text;
}, 60000);

// ─── File System ─────────────────────────────────────────────────────────────
const FS_PREFIX = "codivebox_fs_";
const DEFAULT_FILES = {
  "main.py": { name:"main.py", language:"python", content:"# main.py\n\ndef hello(name):\n    return f\"Hello, {name}!\"\n\nif __name__ == \"__main__\":\n    print(hello(\"CodiveBox\"))\n    print(\"Ready to code!\")\n" },
  "index.html": { name:"index.html", language:"html", content:"<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title>Preview</title>\n</head>\n<body>\n  <h1>Hello CodiveBox</h1>\n</body>\n</html>\n" },
  "style.css": { name:"style.css", language:"css", content:"/* style.css */\n\nbody {\n  font-family: system-ui, sans-serif;\n  margin: 40px;\n  background: #111;\n  color: #eee;\n}\n\nh1 { color: #fff; }\n" },
};
let fileSystem = {};
let currentProjectName = "UNTITLED";

function updateProjectName(name) {
  currentProjectName = name || "UNTITLED";
  if (topProjectName) topProjectName.textContent = currentProjectName;
  if (explorerProjectTitle) explorerProjectTitle.textContent = currentProjectName;
}

function loadFS() {
  try {
    const raw = localStorage.getItem(FS_PREFIX+"index");
    if (raw) fileSystem = JSON.parse(raw);
    const n = localStorage.getItem(FS_PREFIX+"project_name");
    if (n) updateProjectName(n);
    if (raw) return;
  } catch(e) {}
  fileSystem = {};
  for (const [name, f] of Object.entries(DEFAULT_FILES)) fileSystem[name] = { ...f, savedAt: Date.now() };
  saveFS();
}
function saveFS() { localStorage.setItem(FS_PREFIX+"index", JSON.stringify(fileSystem)); localStorage.setItem(FS_PREFIX+"project_name", currentProjectName); }

function createFile(name, language, content) {
  if (fileSystem[name]) return false;
  const ext = name.split(".").pop();
  const m = { py:"python", js:"javascript", ts:"typescript", tsx:"typescript", jsx:"javascript", html:"html", css:"css", json:"json", md:"markdown", txt:"text", sql:"sql", sh:"bash", bash:"bash", yaml:"yaml", yml:"yaml", toml:"toml", xml:"xml", svg:"xml" };
  fileSystem[name] = { name, language: language||m[ext]||"text", content: content||"", savedAt: Date.now() };
  saveFS(); return true;
}
function deleteFile(name) {
  const dp = fileSystem[name]?.diskPath;
  delete fileSystem[name]; saveFS();
  openFiles1 = openFiles1.filter(f => f !== name);
  openFiles2 = openFiles2.filter(f => f !== name);
  if (activeFile1 === name) { activeFile1 = allOpenFiles()[0] || "main.py"; if (!fileSystem[activeFile1]) { createFile("main.py","python",DEFAULT_FILES["main.py"].content); openFiles1.push("main.py"); } }
  if (activeFile2 === name) { activeFile2 = null; }
  if (dp && window.codivebox?.deleteFileDisk) window.codivebox.deleteFileDisk(dp);
}
function renameFile(oldName, newName) {
  if (!fileSystem[oldName] || fileSystem[newName]) return false;
  fileSystem[newName] = { ...fileSystem[oldName], name: newName };
  delete fileSystem[oldName]; saveFS();
  openFiles1 = openFiles1.map(f => f === oldName ? newName : f);
  openFiles2 = openFiles2.map(f => f === oldName ? newName : f);
  if (activeFile1 === oldName) activeFile1 = newName;
  if (activeFile2 === oldName) activeFile2 = newName;
  return true;
}

const RECENT_PROJECTS_KEY = "codivebox_recent_projects";
const MAX_RECENT_PROJECTS = 10;
function loadRecentProjects() {
  try { return JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || "[]"); } catch(e) { return []; }
}
function saveRecentProjects(list) {
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(list.slice(0, MAX_RECENT_PROJECTS)));
}
function addRecentProject(path, name) {
  const list = loadRecentProjects().filter(p => p.path !== path);
  list.unshift({ path, name, openedAt: Date.now() });
  saveRecentProjects(list);
}
function renderProjectMenu() {
  const menu = $("#projectMenu"); if (!menu) return;
  const list = $("#recentProjectsList"); if (!list) return;
  const recent = loadRecentProjects();
  list.innerHTML = "";
  if (!recent.length) { list.innerHTML = '<div class="project-menu-empty">No recent folders</div>'; }
  else recent.forEach(p => {
    const item = document.createElement("div");
    item.className = "project-menu-item";
    item.textContent = p.name;
    item.title = p.path;
    item.addEventListener("click", () => { hideProjectMenu(); openFolderPath(p.path); });
    list.appendChild(item);
  });
}
function showProjectMenu() {
  const btn = $("#topProject"); const menu = $("#projectMenu");
  if (!btn || !menu) return;
  renderProjectMenu();
  const rect = btn.getBoundingClientRect();
  menu.style.left = rect.left + "px";
  menu.style.top = (rect.bottom + 4) + "px";
  menu.classList.remove("hidden");
  btn.classList.add("open");
}
function hideProjectMenu() {
  $("#projectMenu")?.classList.add("hidden");
  $("#topProject")?.classList.remove("open");
}
function toggleProjectMenu() {
  const menu = $("#projectMenu");
  if (!menu) return;
  if (menu.classList.contains("hidden")) showProjectMenu(); else hideProjectMenu();
}

async function openFolderPath(folderPath) {
  if (!window.codivebox?.openFolderPath) { appendOutput("info", "Recent folders only in desktop app."); return; }
  const result = await window.codivebox.openFolderPath(folderPath);
  if (!result) return;
  fileSystem = {};
  result.files.forEach(f => { fileSystem[f.name] = { name:f.name, language:f.language, content:f.content, savedAt:Date.now(), diskPath:f.path }; });
  const name = (result.path.split(/[\\/]/).pop() || "UNTITLED").toUpperCase();
  updateProjectName(name);
  addRecentProject(result.path, name);
  openFiles1 = result.files[0] ? [result.files[0].name] : []; activeFile1 = openFiles1[0] || null;
  openFiles2 = []; activeFile2 = null; previewFile = null;
  saveFS(); renderFileTree(); renderTabs();
  if (activeFile1) openFile(activeFile1, 1);
  appendOutput("success", "Opened " + result.path + " (" + result.files.length + " files)");
}

async function openRealFolder() {
  if (!window.codivebox?.openFolder) { appendOutput("info", "Open Folder only in desktop app."); return; }
  const result = await window.codivebox.openFolder();
  if (!result) return;
  fileSystem = {};
  result.files.forEach(f => { fileSystem[f.name] = { name:f.name, language:f.language, content:f.content, savedAt:Date.now(), diskPath:f.path }; });
  const name = (result.path.split(/[\\/]/).pop() || "UNTITLED").toUpperCase();
  updateProjectName(name);
  addRecentProject(result.path, name);
  openFiles1 = result.files[0] ? [result.files[0].name] : []; activeFile1 = openFiles1[0] || null;
  openFiles2 = []; activeFile2 = null; previewFile = null;
  saveFS(); renderFileTree(); renderTabs();
  if (activeFile1) openFile(activeFile1, 1);
  appendOutput("success", "Opened " + result.path + " (" + result.files.length + " files)");
}

function createFolder(path) {
  const fp = path.endsWith("/") ? path : path + "/";
  if (fileSystem[fp]) return false;
  fileSystem[fp] = { name:fp, isFolder:true, savedAt:Date.now() };
  saveFS(); return true;
}

const FOLDER_COLLAPSE_KEY = "codivebox_folder_collapse";
let collapsedFolders = new Set();
try { collapsedFolders = new Set(JSON.parse(localStorage.getItem(FOLDER_COLLAPSE_KEY) || "[]")); } catch(e) {}

function buildTree() {
  const root = { name:'', path:'', isFolder:true, children:[], indent:0 };
  for (const path of Object.keys(fileSystem).sort()) {
    const parts = path.split('/'); let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]; const isLast = i === parts.length - 1;
      const cp = parts.slice(0, i + 1).join('/');
      const isFolder = !isLast || fileSystem[path]?.isFolder;
      let child = current.children.find(c => c.name === part);
      if (!child) { child = { name:part, path:cp, isFolder, children:[], indent:current.indent+1, data: isLast && !isFolder ? fileSystem[path] : null }; current.children.push(child); }
      current = child;
    }
  }
  return root;
}

function renderFileTree() {
  if (!fileTree) return;
  fileTree.innerHTML = "";
  const tree = buildTree();
  renderNode(tree, fileTree, true);
}
function renderNode(node, container, isRoot) {
  if (!isRoot) { node.isFolder ? renderFolder(node, container) : renderFile(node, container); }
  else node.children.forEach(c => renderNode(c, container, false));
}
function renderFolder(node, container) {
  const collapsed = collapsedFolders.has(node.path);
  const isSelected = lastTreeSelection && lastTreeSelection.type === "folder" && lastTreeSelection.path === node.path;
  const div = document.createElement("div");
  div.className = "folder-item" + (isSelected ? " selected" : "");
  div.innerHTML = `<div class="folder-item-inner" style="padding-left:${4+node.indent*14}px"><span class="folder-item-arrow ${collapsed?'':'expanded'}">&#x25B8;</span><span class="folder-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dcb67a" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span><span class="folder-item-name">${node.name}</span></div>`;
  container.appendChild(div);
  const inner = div.querySelector(".folder-item-inner");
  inner.addEventListener("contextmenu", e => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, "folder", node.path);
  });
  inner.addEventListener("click", () => { lastTreeSelection = { type: "folder", path: node.path }; renderFileTree(); });
  div.querySelector(".folder-item-arrow").addEventListener("click", e => {
    e.stopPropagation();
    collapsedFolders.has(node.path) ? collapsedFolders.delete(node.path) : collapsedFolders.add(node.path);
    localStorage.setItem(FOLDER_COLLAPSE_KEY, JSON.stringify([...collapsedFolders]));
    renderFileTree();
  });
  const cd = document.createElement("div");
  cd.className = "folder-children" + (collapsed ? " collapsed" : "");
  container.appendChild(cd);
  node.children.forEach(c => renderNode(c, cd, false));
}
function renderFile(node, container) {
  const name = node.path;
  const isActive = name === (activePane === 1 ? activeFile1 : activeFile2);
  const isSelected = lastTreeSelection && lastTreeSelection.type === "file" && lastTreeSelection.path === name;
  const div = document.createElement("div");
  div.className = "file-item" + (isActive ? " active" : "") + (isSelected ? " selected" : "");
  div.innerHTML = `<div class="file-item-inner" style="padding-left:${4+node.indent*14}px"><span class="file-name">${node.name}</span></div>`;
  container.appendChild(div);
  let clickTimer = null;
  div.addEventListener("click", () => {
    lastTreeSelection = { type: "file", path: name };
    renderFileTree();
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
    clickTimer = setTimeout(() => { clickTimer = null; openFile(name, activePane, { preview: true }); }, 220);
  });
  div.addEventListener("dblclick", () => {
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    openFile(name, activePane);
  });
  div.addEventListener("contextmenu", e => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, "file", name);
  });
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
const contextMenu = document.getElementById("contextMenu");
let contextTargetPath = null;
let contextTargetType = null;
let lastTreeSelection = null;

function showContextMenu(x, y, type, path) {
  contextTargetType = type;
  contextTargetPath = path;
  lastTreeSelection = { type, path };
  if (!contextMenu) return;
  const items = [];
  if (type === "file") {
    items.push({ label: "Open", action: () => openFile(path, activePane) });
    items.push({ label: "Open to the Side", action: () => openFile(path, activePane === 1 ? 2 : 1) });
    items.push({ type: "separator" });
    items.push({ label: "Rename", shortcut: "F2", action: () => startInlineRename(path, type) });
    items.push({ label: "Duplicate", action: () => duplicateFile(path) });
    items.push({ label: "Delete", shortcut: "Del", action: () => { deleteFile(path); renderFileTree(); renderTabs(); }, danger: true });
  } else if (type === "folder") {
    items.push({ label: "New File", action: () => createItemInFolder(path, "file") });
    items.push({ label: "New Folder", action: () => createItemInFolder(path, "folder") });
    items.push({ type: "separator" });
    items.push({ label: "Rename", action: () => startInlineRename(path, type) });
    items.push({ label: "Delete", action: () => deleteFolder(path), danger: true });
  }
  buildContextMenu(contextMenu, items);
  contextMenu.classList.remove("hidden");
  const rect = contextMenu.getBoundingClientRect();
  contextMenu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + "px";
  contextMenu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + "px";
}

function buildContextMenu(menuEl, items) {
  menuEl.innerHTML = "";
  items.forEach(item => {
    if (item.type === "separator") {
      const sep = document.createElement("div");
      sep.className = "context-separator";
      menuEl.appendChild(sep);
    } else {
      const div = document.createElement("div");
      div.className = "context-item" + (item.danger ? " danger" : "");
      div.innerHTML = `<span>${item.label}</span>${item.shortcut ? `<span class="context-shortcut">${item.shortcut}</span>` : ""}`;
      div.addEventListener("click", () => { hideContextMenu(); if (item.action) setTimeout(item.action, 30); });
      menuEl.appendChild(div);
    }
  });
}

function hideContextMenu() {
  contextMenu?.classList.add("hidden");
  contextTargetPath = null;
  contextTargetType = null;
}

document.addEventListener("click", e => { if (!e.target.closest("#contextMenu")) hideContextMenu(); });
document.addEventListener("contextmenu", e => { if (!e.target.closest(".file-tree") && !e.target.closest("#contextMenu")) hideContextMenu(); });

function getNewItemFolder() {
  if (lastTreeSelection && lastTreeSelection.type === "folder") return lastTreeSelection.path;
  return "";
}

function createItemInFolder(folderPath, kind) {
  const fp = folderPath ? (folderPath.endsWith("/") ? folderPath : folderPath + "/") : "";
  const base = kind === "file" ? "new-file.js" : "new-folder";
  let counter = 1;
  let fullPath = fp + base;
  while (fileSystem[fullPath]) {
    if (kind === "file") {
      const ext = base.split(".").pop();
      const nameNoExt = base.substring(0, base.length - ext.length - 1);
      fullPath = fp + nameNoExt + " (" + counter + ")." + ext;
    } else {
      fullPath = fp + base + " (" + counter + ")";
    }
    counter++;
  }
  if (kind === "file") {
    const ext = fullPath.split(".").pop();
    const m = { py:"python", js:"javascript", ts:"typescript", tsx:"typescript", jsx:"javascript", html:"html", css:"css", json:"json", md:"markdown", txt:"text", sql:"sql", sh:"bash", bash:"bash", yaml:"yaml", yml:"yaml", toml:"toml", xml:"xml", svg:"xml" };
    createFile(fullPath, m[ext] || "text", "");
    renderFileTree(); renderTabs();
    openFile(fullPath, activePane);
    startInlineRename(fullPath, "file");
  } else {
    createFolder(fullPath);
    collapsedFolders.delete(fullPath);
    localStorage.setItem(FOLDER_COLLAPSE_KEY, JSON.stringify([...collapsedFolders]));
    renderFileTree();
    startInlineRename(fullPath, "folder");
  }
}

function duplicateFile(path) {
  const f = fileSystem[path];
  if (!f) return;
  const dir = path.includes("/") ? path.substring(0, path.lastIndexOf("/") + 1) : "";
  const name = path.split("/").pop();
  const ext = name.includes(".") ? name.substring(name.lastIndexOf(".") + 1) : "";
  const base = ext ? name.substring(0, name.length - ext.length - 1) : name;
  let counter = 1;
  let newPath;
  do {
    newPath = dir + base + " copy" + (counter > 1 ? " " + counter : "") + (ext ? "." + ext : "");
    counter++;
  } while (fileSystem[newPath]);
  createFile(newPath, f.language, f.content);
  renderFileTree(); renderTabs();
  openFile(newPath, activePane);
}

function startInlineRename(path, type) {
  const name = path.split("/").pop();
  const parentPath = path.substring(0, path.length - name.length);
  const selector = type === "folder" ? ".folder-item-inner" : ".file-item-inner";
  const els = document.querySelectorAll(selector);
  let targetEl = null;
  els.forEach(el => {
    const text = el.querySelector(type === "folder" ? ".folder-item-name" : ".file-name")?.textContent.trim();
    if (text === name) targetEl = el;
  });
  if (!targetEl) { fallbackRename(path, type); return; }
  const nameEl = targetEl.querySelector(type === "folder" ? ".folder-item-name" : ".file-name");
  const input = document.createElement("input");
  input.type = "text";
  input.value = name;
  input.className = "inline-rename-input";
  nameEl.style.display = "none";
  targetEl.appendChild(input);
  input.focus();
  input.select();

  function finish() {
    const newName = input.value.trim();
    input.remove();
    nameEl.style.display = "";
    if (newName && newName !== name) {
      const newPath = parentPath + newName;
      if (type === "file") renameFile(path, newPath);
      else renameFolder(path, newPath);
    }
    renderFileTree(); renderTabs();
  }

  input.addEventListener("keydown", e => { if (e.key === "Enter") finish(); if (e.key === "Escape") { input.remove(); nameEl.style.display = ""; renderFileTree(); } });
  input.addEventListener("blur", finish);
}

function fallbackRename(path, type) {
  const oldName = path.split("/").pop();
  const parentPath = path.substring(0, path.length - oldName.length);
  const newName = prompt("Rename to:", oldName);
  if (!newName || newName === oldName) return;
  const newPath = parentPath + newName;
  if (type === "file") renameFile(path, newPath);
  else renameFolder(path, newPath);
  renderFileTree(); renderTabs();
}

function renameFolder(oldPath, newPath) {
  const entries = Object.keys(fileSystem).filter(k => k === oldPath || k.startsWith(oldPath + "/"));
  const updates = [];
  entries.forEach(k => {
    const rest = k === oldPath ? "" : k.substring(oldPath.length);
    const newKey = newPath + rest;
    updates.push({ oldKey: k, newKey, data: fileSystem[k] });
  });
  updates.forEach(u => { fileSystem[u.newKey] = { ...u.data, name: u.newKey }; delete fileSystem[u.oldKey]; });
  const remap = p => p.startsWith(oldPath + "/") ? newPath + p.substring(oldPath.length) : (p === oldPath ? newPath : p);
  openFiles1 = openFiles1.map(remap);
  openFiles2 = openFiles2.map(remap);
  if (activeFile1 === oldPath || activeFile1?.startsWith(oldPath + "/")) activeFile1 = remap(activeFile1);
  if (activeFile2 === oldPath || activeFile2?.startsWith(oldPath + "/")) activeFile2 = remap(activeFile2);
  const oldCollapsed = [...collapsedFolders];
  collapsedFolders.clear();
  oldCollapsed.forEach(c => {
    if (c === oldPath || c.startsWith(oldPath + "/")) collapsedFolders.add(remap(c));
    else collapsedFolders.add(c);
  });
  localStorage.setItem(FOLDER_COLLAPSE_KEY, JSON.stringify([...collapsedFolders]));
  saveFS();
}

function deleteFolder(path) {
  if (!confirm('Delete folder "' + path + '" and all its contents?')) return;
  Object.keys(fileSystem).forEach(k => { if (k === path || k.startsWith(path + "/")) delete fileSystem[k]; });
  saveFS();
  openFiles1 = openFiles1.filter(f => !f.startsWith(path + "/"));
  openFiles2 = openFiles2.filter(f => !f.startsWith(path + "/"));
  if (activeFile1 && activeFile1.startsWith(path + "/")) { activeFile1 = openFiles1[0] || "main.py"; if (!fileSystem[activeFile1]) { createFile("main.py", "python", DEFAULT_FILES["main.py"].content); openFiles1.push("main.py"); } }
  if (activeFile2 && activeFile2.startsWith(path + "/")) { activeFile2 = null; }
  renderFileTree(); renderTabs(); openFile(activeFile1, 1);
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function renderTabs() {
  if (!tabsBar) return;
  tabsBar.innerHTML = "";
  const ofs = getOpenFiles();
  const af = getActiveFile();
  ofs.forEach(name => {
    const tab = document.createElement("div");
    const isPreview = name === previewFile;
    const isDirty = fileSystem[name]?._dirty;
    tab.className = "tab" + (name === af ? " active" : "") + (isPreview ? " preview" : "");
    tab.innerHTML = (isDirty ? '<span class="tab-dot"></span>' : '') + name + '<svg class="tab-close" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    tabsBar.appendChild(tab);
    tab.addEventListener("click", function(e) {
      if (e.target.closest(".tab-close")) { e.stopPropagation(); closeTab(name); return; }
      openFile(name, activePane);
    });
    tab.addEventListener("dblclick", function(e) {
      e.stopPropagation();
      openFile(name, activePane);
    });
  });
  const rb = document.createElement("button");
  rb.className = "run-tab-btn";
  rb.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run';
  tabsBar.appendChild(rb);
  rb.addEventListener("click", () => runCode());
  // Split button
  const sp = document.createElement("button");
  sp.className = "run-tab-btn";
  sp.title = "Split Editor (Ctrl+\\)";
  sp.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1" stroke-dasharray="2 2"/></svg> Split';
  tabsBar.appendChild(sp);
  sp.addEventListener("click", toggleSplit);
}

function openFile(name, pane, opts = {}) {
  if (!fileSystem[name]) return;
  pane = pane || activePane;
  const ed = getEditor(pane);

  autoSaveIfEnabled();
  // Save current content in the active editor before switching
  if (pane === 1 && editor && activeFile1 && fileSystem[activeFile1] && editor.getValue() !== fileSystem[activeFile1].content) {
    fileSystem[activeFile1].content = editor.getValue(); saveFS();
  }
  if (pane === 2 && editor2 && activeFile2 && fileSystem[activeFile2] && editor2.getValue() !== fileSystem[activeFile2].content) {
    fileSystem[activeFile2].content = editor2.getValue(); saveFS();
  }

  if (opts.preview) {
    if (previewFile && previewFile !== name) {
      if (activePane === 1) openFiles1 = openFiles1.filter(f => f !== previewFile);
      else openFiles2 = openFiles2.filter(f => f !== previewFile);
    }
    previewFile = name;
  } else if (previewFile === name) {
    previewFile = null;
  }

  setActiveFile(pane, name);
  const ofsArr = getOpenFiles(pane);
  if (!ofsArr.includes(name)) { if (pane === 1) openFiles1.push(name); else openFiles2.push(name); }

  const f = fileSystem[name];
  const modes = { python:"python", javascript:"javascript", js:"javascript", html:"htmlmixed", css:"css", json:"application/json", markdown:"markdown", md:"markdown", typescript:"application/typescript", ts:"application/typescript", tsx:"application/typescript", jsx:"javascript", sql:"text/x-sql", bash:"text/x-sh", sh:"text/x-sh", shell:"text/x-sh", yaml:"text/x-yaml", yml:"text/x-yaml", toml:"text/x-toml", xml:"xml", svg:"xml" };

  if (ed) { ed.setOption("mode", modes[f.language]||"text"); ed.setValue(f.content); setTimeout(() => ed.refresh(), 50); }
  activePane = pane;
  renderTabs(); renderFileTree(); updateBreadcrumbs();
  if (statusLanguage) statusLanguage.textContent = f.language.charAt(0).toUpperCase() + f.language.slice(1);
}
function closeTab(name) {
  const ofs = getOpenFiles();
  if (ofs.length <= 1) return;
  const ed = getEditor();
  const af = getActiveFile();
  if (ed && name === af && fileSystem[name]) { fileSystem[name].content = ed.getValue(); saveFS(); }
  if (activePane === 1) openFiles1 = openFiles1.filter(f => f !== name);
  else openFiles2 = openFiles2.filter(f => f !== name);
  if (previewFile === name) previewFile = null;
  if (af === name) {
    const next = activePane === 1 ? openFiles1[openFiles1.length-1] : openFiles2[openFiles2.length-1];
    openFile(next, activePane);
  } else renderTabs();
}
function cycleTab(dir) {
  const ofs = getOpenFiles();
  const af = getActiveFile();
  if (!ofs.length) return;
  let idx = ofs.indexOf(af);
  if (idx < 0) idx = 0;
  idx = (idx + dir + ofs.length) % ofs.length;
  openFile(ofs[idx], activePane);
}

function updateBreadcrumbs() {
  if (!editorBreadcrumbs) return;
  const af = getActiveFile();
  const parts = af ? af.split("/") : [""];
  editorBreadcrumbs.innerHTML = parts.map((p, i) => `<span>${p}</span>${i < parts.length-1 ? '<span style="opacity:.3">/</span>' : ''}`).join("");
}

// ─── Output ───────────────────────────────────────────────────────────────────
function appendOutput(type, text) {
  if (!outputContent) return;
  const line = document.createElement("div");
  line.className = "output-line " + type;
  line.textContent = text;
  outputContent.appendChild(line);
  outputContent.scrollTop = outputContent.scrollHeight;
  if (!isBottomOpen) toggleBottomPanel(true);
  const outTab = document.querySelector('.bottom-tab[data-btab="output"]');
  if (outTab) outTab.click();
}

// ─── Pyodide ──────────────────────────────────────────────────────────────────
async function loadPyodide() {
  if (pyodide) return pyodide;
  if (pyodideLoading) return new Promise(r => { const c = setInterval(() => { if (pyodide) { clearInterval(c); r(pyodide); } }, 200); });
  pyodideLoading = true; appendOutput("info","Loading Python runtime...");
  if (!window.loadPyodide) {
    const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
    document.head.appendChild(s);
    await new Promise((resolve, reject) => { s.onload = resolve; s.onerror = () => reject(new Error("Pyodide load failed")); });
  }
  pyodide = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
  appendOutput("success","Python "+pyodide.runPython("import sys; sys.version").split(" ")[0]+" ready");
  pyodideLoading = false; return pyodide;
}

async function runCode() {
  const ed = getEditor(); if (!ed) return;
  const af = getActiveFile();
  const code = ed.getValue(); if (!code.trim()) return;
  const f = fileSystem[af]; const lang = f ? f.language : "python";
  if (f) { f.content = code; saveFS(); }
  toggleBottomPanel(true);
  if (lang === "python") {
    appendOutput("info",">>> python "+af);
    try {
      const py = await loadPyodide();
      py.runPython("import sys, io; __cb_stdout = io.StringIO(); sys.stdout = __cb_stdout");
      py.runPython(code);
      const out = py.runPython("__cb_stdout.getvalue()");
      py.runPython("sys.stdout = sys.__stdout__");
      (out || "(no output)").split("\n").forEach(l => appendOutput("info", l||" "));
    } catch (err) { appendOutput("error",err.message); }
  } else if (lang === "html") {
    appendOutput("info",">>> Opening preview...");
    window.open(URL.createObjectURL(new Blob([code],{type:"text/html"})),"_blank");
  } else { appendOutput("info","Running "+af+"..."); }
}

// ─── Loaders ──────────────────────────────────────────────────────────────────
function loadCSS(u) { return new Promise(r => { const l = document.createElement("link"); l.rel="stylesheet"; l.href=u; l.onload=r; document.head.appendChild(l); }); }
function loadScript(u) { return new Promise((resolve, reject) => { const s = document.createElement("script"); s.src=u; s.onload=resolve; s.onerror=()=>reject(new Error("Failed: "+u)); document.head.appendChild(s); }); }

// ─── Editor ───────────────────────────────────────────────────────────────────
async function initEditor() {
  await loadCSS("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/lib/codemirror.min.css");
  await loadCSS("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/hint/show-hint.min.css");
  await loadCSS("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/fold/foldgutter.min.css");
  await loadCSS("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/dialog/dialog.min.css");
  await loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/lib/codemirror.min.js");
  await Promise.all([
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/python/python.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/javascript/javascript.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/javascript/typescript.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/xml/xml.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/htmlmixed/htmlmixed.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/css/css.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/markdown/markdown.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/sql/sql.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/shell/shell.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/yaml/yaml.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/edit/closebrackets.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/edit/matchbrackets.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/selection/active-line.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/hint/show-hint.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/hint/anyword-hint.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/hint/javascript-hint.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/hint/python-hint.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/hint/sql-hint.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/hint/css-hint.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/hint/html-hint.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/hint/xml-hint.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/fold/foldcode.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/fold/foldgutter.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/fold/brace-fold.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/fold/indent-fold.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/fold/comment-fold.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/dialog/dialog.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/search/searchcursor.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/search/search.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/codemirror@5.65.18/addon/search/jump-to-line.min.js"),
  ]);

  editor = CodeMirror($("#editor"), {
    mode: "python", theme: "df", lineNumbers: true, matchBrackets: true, autoCloseBrackets: true,
    styleActiveLine: true, indentUnit: 4, tabSize: 4, viewportMargin: Infinity,
    foldGutter: true, gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    extraKeys: {
      "Ctrl-Space": "autocomplete",
      "Ctrl-F": () => editor.execCommand("find"),
      "Ctrl-H": () => editor.execCommand("replace"),
      "Ctrl-G": () => editor.execCommand("jumpToLine"),
      "Tab": cm => { if (cm.somethingSelected()) cm.indentSelection("add"); else cm.replaceSelection("    ", "end"); },
    },
    hintOptions: {
      completeSingle: false,
      hint: function(cm) {
        const mode = cm.getModeAt(cm.getCursor()).name;
        const modeHints = {
          "python": CodeMirror.hint.python,
          "javascript": CodeMirror.hint.javascript,
          "typescript": CodeMirror.hint.javascript,
          "text/x-sql": CodeMirror.hint.sql,
          "css": CodeMirror.hint.css,
          "htmlmixed": CodeMirror.hint.html,
          "xml": CodeMirror.hint.xml,
        };
        const fn = modeHints[mode];
        return fn ? fn(cm) : CodeMirror.hint.anyword(cm);
      }
    },
  });

  editor.on("change", () => {
    if (editor && activeFile1 && fileSystem[activeFile1]) {
      fileSystem[activeFile1].content = editor.getValue();
      fileSystem[activeFile1]._dirty = true;
    }
  });
  editor.on("cursorActivity", () => {
    if (!editor) return;
    const cur = editor.getCursor();
    if (statusLineCol) statusLineCol.textContent = "Ln " + (cur.line+1) + ", Col " + (cur.ch+1);
  });
  editor.on("change", function(cm, change) {
    if (change.origin !== "+input" && change.origin !== "paste") return;
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    const word = token.string;
    if (word.length >= 2 && change.text && change.text.length === 1) {
      CodeMirror.commands.autocomplete(cm);
    }
  });

  setTimeout(() => editor.refresh(), 100);

  // Indent guides via renderLine
  editor.on("renderLine", function(cm, line, elt) {
    const indent = line.text.match(/^\s*/)[0].length;
    const unit = cm.getOption("indentUnit") || 4;
    const cw = cm.defaultCharWidth() || 8.4;
    elt.querySelectorAll(".cm-indent-guide").forEach(e => e.remove());
    for (let i = 1; i * unit <= indent; i++) {
      const g = document.createElement("div");
      g.className = "cm-indent-guide";
      g.style.left = (4 + i * unit * cw) + "px";
      g.style.height = elt.offsetHeight + "px";
      elt.appendChild(g);
    }
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function getModel() { return document.getElementById("chatModelSelect")?.value || "deepseek-chat"; }

function addMsg(role, text) {
  const d = document.createElement("div"); d.className = "chat-msg "+role;
  const isUser = role === "user";
  d.innerHTML = '<div class="msg-avatar">'+(isUser?"U":"C")+'</div><div class="msg-content"><div class="msg-header"><span class="msg-author">'+(isUser?"You":"CodiveBox")+'</span></div><div class="msg-text">'+fmt(text)+'</div></div>';
  chatMessages.appendChild(d); chatMessages.scrollTop = chatMessages.scrollHeight;
}

function fmt(text) {
  const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const parts = []; const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type:"text", content: text.slice(last, m.index) });
    parts.push({ type:"code", lang: m[1] || "text", content: m[2] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type:"text", content: text.slice(last) });
  return parts.map(p => {
    if (p.type === "text") return esc(p.content).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>");
    const lines = p.content.split("\n"); let fname = "";
    const fm = lines[0].match(/(?:\/\/|#|--)\s*(?:filename?|file)\s*[=:]\s*(.+)/i);
    if (fm) { fname = fm[1].trim(); lines.shift(); }
    const clean = lines.join("\n").trimStart();
    const label = { js:"JavaScript", py:"Python", html:"HTML", css:"CSS", json:"JSON", md:"Markdown" }[p.lang.toLowerCase()] || p.lang || "Code";
    const id = "cb_"+Math.random().toString(36).slice(2);
    return `<div class="chat-code-block"><div class="chat-code-header"><span class="chat-code-lang">${fname ? fname+"  -  "+label : label}</span><div class="chat-code-actions"><button class="chat-code-btn" data-action="apply" data-id="${id}" data-filename="${esc(fname)}">Apply</button><button class="chat-code-btn" data-action="copy" data-id="${id}">Copy</button></div></div><pre class="chat-code-pre" id="${id}"><code>${esc(clean)}</code></pre></div>`;
  }).join("");
}

function showTyping() {
  const d = document.createElement("div"); d.className="chat-msg bot"; d.id="typingIndicator";
  d.innerHTML = '<div class="msg-avatar">C</div><div class="msg-content"><div class="msg-header"><span class="msg-author">CodiveBox</span></div><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
  chatMessages.appendChild(d); chatMessages.scrollTop = chatMessages.scrollHeight;
}
function hideTyping() { const e = document.getElementById("typingIndicator"); if (e) e.remove(); }

async function sendMsg() {
  const text = chatInput.value.trim(); if (!text) return;
  const url = apiUrlInput.value.trim(), key = apiKeyInput.value.trim(), model = getModel();
  if (!url || !key) { addMsg("bot","Configure API in Settings (gear icon in activity bar)."); chatInput.value=""; return; }
  let ctx = "";
  if (editor && activeFile1 && fileSystem[activeFile1]) { const c = editor.getValue(); if (c.trim()) ctx = "\n\n[Current file: "+activeFile1+"]\n```\n"+c+"\n```"; }
  addMsg("user", text); messages.push({ role:"user", content: text+ctx });
  chatInput.value=""; showTyping();
  statusConnection.innerHTML = '<span class="status-dot online"></span>';
  const maxT = parseInt(maxTokensSlider?.value || 4096);
  try {
    const resp = await fetch(url, {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
      body: JSON.stringify({ model, messages: [{ role:"system", content: systemPromptEl?.value || "" }, ...messages.slice(-15)], temperature: parseFloat(temperatureSlider?.value || 0.7), max_tokens: maxT, top_p: parseFloat(topPSlider?.value || 0.9) }),
    });
    if (!resp.ok) {
      const status = resp.status;
      let msg = "Error " + status;
      if (status === 401) msg = "Invalid API key — check your key in Settings";
      else if (status === 403) msg = "Access denied — your API key may not have permission";
      else if (status === 429) msg = "Rate limited — wait a moment and try again";
      else if (status >= 500) msg = "Server error " + status + " — the API provider may be down";
      throw new Error(msg);
    }
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || data.message?.content || data.content || JSON.stringify(data);
    hideTyping(); addMsg("bot",reply); messages.push({ role:"assistant", content:reply });
    statusConnection.innerHTML = '<span class="status-dot online"></span>';
  } catch (err) {
    hideTyping();
    addMsg("bot","Error: "+err.message);
    statusConnection.innerHTML='<span class="status-dot error"></span>';
  }
}

// ─── Code block actions ──────────────────────────────────────────────────────
document.addEventListener("click", e => {
  const btn = e.target.closest(".chat-code-btn");
  if (!btn) return;
  const pre = document.getElementById(btn.dataset.id);
  if (!pre) return;
  const code = pre.querySelector("code").textContent;
  if (btn.dataset.action === "copy") { navigator.clipboard.writeText(code).then(() => { btn.textContent="Copied!"; setTimeout(()=>{btn.textContent="Copy"},1500); }); }
  if (btn.dataset.action === "apply") {
    const ed = getEditor(); if (!ed) return;
    let target = btn.dataset.filename || getActiveFile();
    if (!fileSystem[target]) { const ext = target.split(".").pop(); const m = { py:"python", js:"javascript", ts:"typescript", tsx:"typescript", jsx:"javascript", html:"html", css:"css", json:"json", md:"markdown", txt:"text", sql:"sql", sh:"bash", bash:"bash", yaml:"yaml", yml:"yaml", toml:"toml", xml:"xml", svg:"xml" }; createFile(target, m[ext]||"text", ""); }
    if (target !== getActiveFile()) openFile(target, activePane);
    editor.setValue(code);
    if (fileSystem[target]) { fileSystem[target].content = code; fileSystem[target]._dirty = true; saveFS(); }
    btn.textContent="Applied!"; setTimeout(()=>{btn.textContent="Apply"},1500);
  }
});

// ─── Sidebar switching ───────────────────────────────────────────────────────
const sidebarViews = ["explorer","search","git","deployments","database","extensions"];
const sidebarTitles = { explorer:"EXPLORER", search:"SEARCH", git:"SOURCE CONTROL", deployments:"DEPLOYMENTS", database:"DATABASE", extensions:"EXTENSIONS" };

function switchSidebar(view) {
  currentSidebar = view;
  if (sidebarTitle) sidebarTitle.textContent = sidebarTitles[view] || view.toUpperCase();
  $$(".sidebar-view").forEach(v => v.classList.remove("active"));
  const target = document.getElementById("sb" + view.charAt(0).toUpperCase() + view.slice(1));
  if (target) target.classList.add("active");
  $$(".activity-btn[data-sidebar]").forEach(b => b.classList.toggle("active", b.dataset.sidebar === view));
}

$$(".activity-btn[data-sidebar]").forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.sidebar;
    if (view === currentSidebar) { document.body.classList.toggle("sidebar-hidden"); return; }
    document.body.classList.remove("sidebar-hidden");
    switchSidebar(view);
  });
});

// ─── Right panel tabs ────────────────────────────────────────────────────────
$$(".right-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const rtab = tab.dataset.rtab;
    currentRightTab = rtab;
    $$(".right-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    $$(".rtab-panel").forEach(p => p.classList.remove("active"));
    const target = document.getElementById("rtab"+rtab.charAt(0).toUpperCase()+rtab.slice(1));
    if (target) target.classList.add("active");
  });
});

$("#rightPanelCollapse")?.addEventListener("click", () => {
  document.body.classList.toggle("right-hidden");
});

// ─── Bottom panel ─────────────────────────────────────────────────────────────
function toggleBottomPanel(open) {
  if (open !== undefined) isBottomOpen = open;
  else isBottomOpen = !isBottomOpen;
  document.body.classList.toggle("bottom-collapsed", !isBottomOpen);
}

$$(".bottom-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const btab = tab.dataset.btab;
    $$(".bottom-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    $$(".btab-panel").forEach(p => p.classList.remove("active"));
    const target = document.getElementById("btab"+btab.split("-").map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(""));
    if (target) target.classList.add("active");
    if (!isBottomOpen) toggleBottomPanel(true);
    if (btab === "terminal") initTerminal();
  });
});

$("#toggleBottomPanel")?.addEventListener("click", () => toggleBottomPanel());

// ─── Top Bar ──────────────────────────────────────────────────────────────────
topSearch?.addEventListener("click", openCommandPalette);
$("#topRunBtn")?.addEventListener("click", runCode);
$("#topSettingsBtn")?.addEventListener("click", () => settingsModal.classList.remove("hidden"));
$("#activitySettingsBtn")?.addEventListener("click", () => settingsModal.classList.remove("hidden"));
$("#topProject")?.addEventListener("click", (e) => { e.stopPropagation(); toggleProjectMenu(); });
$("#openFolderItem")?.addEventListener("click", () => { hideProjectMenu(); openRealFolder(); });
document.addEventListener("click", e => { if (!e.target.closest("#projectMenu") && !e.target.closest("#topProject")) hideProjectMenu(); });

// ─── Settings Modal ───────────────────────────────────────────────────────────
const autoSaveSelect = $("#autoSaveSelect");
function loadAutoSaveSetting() {
  if (autoSaveSelect) autoSaveSelect.value = autoSaveMode;
}
function setAutoSaveMode(mode) {
  autoSaveMode = mode;
  localStorage.setItem("codivebox_autosave", mode);
}
autoSaveSelect?.addEventListener("change", () => setAutoSaveMode(autoSaveSelect.value));
$("#settingsModalClose")?.addEventListener("click", () => settingsModal.classList.add("hidden"));
$(".settings-overlay")?.addEventListener("click", () => settingsModal.classList.add("hidden"));

toggleKeyBtn?.addEventListener("click", () => {
  if (!apiKeyInput) return;
  const t = apiKeyInput.type === "password" ? "text" : "password";
  apiKeyInput.type = t;
  toggleKeyBtn.innerHTML = t === "password"
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
});

temperatureSlider?.addEventListener("input", () => { if (temperatureVal) temperatureVal.value = temperatureSlider.value; });
maxTokensSlider?.addEventListener("input", () => { if (maxTokensVal) maxTokensVal.value = maxTokensSlider.value; });
topPSlider?.addEventListener("input", () => { if (topPVal) topPVal.value = topPSlider.value; });

// ─── Test Connection ──────────────────────────────────────────────────────────
async function testConnection() {
  const url = apiUrlInput?.value.trim();
  const key = apiKeyInput?.value.trim();
  const model = getModel();
  if (!url || !key) { appendOutput("warn","Set API URL and Key first"); return; }
  appendOutput("info","Testing connection to " + model + "...");
  try {
    const resp = await fetch(url, {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
      body: JSON.stringify({ model, messages:[{role:"user",content:"Hi"}], max_tokens:5 }),
    });
    if (resp.ok) {
      appendOutput("success","Connection OK — " + model + " is responding");
    } else {
      const st = resp.status;
      const msgs = { 401:"Invalid API key", 403:"Access denied", 429:"Rate limited — wait and retry" };
      appendOutput("error", "Connection failed: " + (msgs[st] || "HTTP " + st + " — check your settings"));
    }
  } catch (e) {
    appendOutput("error","Connection failed: " + e.message + " — check API URL");
  }
}

document.getElementById("testConnectionBtn")?.addEventListener("click", testConnection);

saveConfigBtn?.addEventListener("click", async () => {
  const cfg = { url: apiUrlInput?.value || "", api: apiKeyInput?.value || "", model: getModel(), temperature: parseFloat(temperatureSlider?.value || 0.7), max_tokens: parseInt(maxTokensSlider?.value || 4096), top_p: parseFloat(topPSlider?.value || 0.9), system_prompt: systemPromptEl?.value || "" };
  // Save to localStorage as cache
  localStorage.setItem("codivebox_config", JSON.stringify(cfg));
  // Write back to config.json via IPC (Electron) or show info (browser)
  if (window.codivebox?.writeConfig) {
    const result = await window.codivebox.writeConfig(cfg);
    if (result.success) {
      appendOutput("success", "Config saved to config.json");
    } else {
      appendOutput("warn", "Config saved to memory only (could not write config.json)");
    }
  } else {
    appendOutput("info", "Config saved to memory (run in Electron to persist to disk)");
  }
  settingsModal.classList.add("hidden");
});

// ─── Chat send ────────────────────────────────────────────────────────────────
chatSendBtn?.addEventListener("click", sendMsg);
chatInput?.addEventListener("keydown", e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } });

// ─── AI Actions ───────────────────────────────────────────────────────────────
$$(".action-card").forEach(card => {
  card.addEventListener("click", () => {
    const action = card.dataset.action;
    const prompts = {
      "generate-code": "Generate code for the current project. Write complete, working code.",
      "refactor": "Refactor the current file to improve readability and maintainability.",
      "create-component": "Create a new React/Vue component based on the current project structure.",
      "write-tests": "Write comprehensive tests for the current file.",
      "generate-docs": "Generate documentation for the current file with clear descriptions.",
      "find-bugs": "Analyze the current file for potential bugs, issues, and improvements.",
      "optimize": "Optimize the current file for better performance.",
    };
    $$(".right-tab").forEach(t => t.classList.remove("active"));
    const chatTab = document.querySelector('.right-tab[data-rtab="chat"]');
    if (chatTab) chatTab.classList.add("active");
    $$(".rtab-panel").forEach(p => p.classList.remove("active"));
    document.getElementById("rtabChat")?.classList.add("active");
    currentRightTab = "chat";
    chatInput.value = prompts[action] || action;
    chatInput.focus();
  });
});

// ─── Explorer buttons ─────────────────────────────────────────────────────────
$("#newFileBtn")?.addEventListener("click", () => createItemInFolder(getNewItemFolder(), "file"));
$("#newFolderBtn")?.addEventListener("click", () => createItemInFolder(getNewItemFolder(), "folder"));
$("#collapseAllBtn")?.addEventListener("click", () => {
  Object.keys(fileSystem).forEach(k => { if (fileSystem[k]?.isFolder) collapsedFolders.add(k); });
  localStorage.setItem(FOLDER_COLLAPSE_KEY, JSON.stringify([...collapsedFolders]));
  renderFileTree();
});
$("#refreshExplorerBtn")?.addEventListener("click", renderFileTree);

// ─── Go Live ──────────────────────────────────────────────────────────────────
goLiveBtn?.addEventListener("click", async () => {
  const af = getActiveFile();
  const f = fileSystem[af]; if (!f) return;
  if (f.diskPath && window.codivebox?.goLive) {
    const dp = f.diskPath;
    const sep = Math.max(dp.lastIndexOf("\\"), dp.lastIndexOf("/"));
    const root = dp.substring(0, sep);
    const rel = dp.substring(sep + 1);
    try {
      const result = await window.codivebox.goLive(root, rel);
      if (result.success) { appendOutput("success", "Live Server: " + result.url); navigator.clipboard.writeText(result.url); }
    } catch(e) { appendOutput("error", e.message); }
  } else if (f.language === "html") {
    window.open(URL.createObjectURL(new Blob([f.content],{type:"text/html"})),"_blank");
    appendOutput("success", "Preview opened");
  }
});

// ─── Save ─────────────────────────────────────────────────────────────────────
function autoSaveIfEnabled() {
  if (autoSaveMode === "onFocusChange") {
    saveActiveFile();
  } else if (autoSaveMode === "afterDelay") {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => { saveActiveFile(); renderTabs(); }, 1000);
  }
}
function saveActiveFile() {
  const ed = getEditor(); const af = getActiveFile();
  if (!ed || !af || !fileSystem[af]) return false;
  const content = ed.getValue();
  fileSystem[af].content = content;
  fileSystem[af]._dirty = false;
  saveFS();
  if (fileSystem[af].diskPath && window.codivebox?.saveFileDisk) {
    window.codivebox.saveFileDisk(fileSystem[af].diskPath, content);
    appendOutput("success", "Saved " + af + " to disk");
  } else {
    appendOutput("success", "Saved " + af + " to memory");
  }
  return true;
}

// Listen for disk save confirmation from main process
if (window.codivebox) {
  window.codivebox.onMenuAction("save-file-disk-result", (result) => {
    if (result.success) {
      appendOutput("success", "Wrote to disk: " + result.path);
    } else {
      appendOutput("error", "Failed to write to disk: " + (result.error || "unknown"));
    }
  });
  window.codivebox.onMenuAction("folder-file-changed", (relPath, content) => {
    if (fileSystem[relPath] && !fileSystem[relPath]._dirty) {
      fileSystem[relPath].content = content;
      fileSystem[relPath].savedAt = Date.now();
      const af = getActiveFile();
      const ed = getEditor();
      if (af === relPath && ed && ed.getValue() !== content) {
        const cur = ed.getCursor();
        ed.setValue(content);
        ed.setCursor(cur);
      }
      saveFS();
    }
  });
  window.codivebox.onMenuAction("folder-file-removed", (relPath) => {
    if (fileSystem[relPath] && !fileSystem[relPath]._dirty) {
      delete fileSystem[relPath];
      openFiles1 = openFiles1.filter(f => f !== relPath);
      openFiles2 = openFiles2.filter(f => f !== relPath);
      if (previewFile === relPath) previewFile = null;
      saveFS(); renderFileTree(); renderTabs();
    }
  });
}

// ─── Config load ──────────────────────────────────────────────────────────────
async function loadConfig() {
  // Try IPC first (Electron), fall back to fetch (browser/dev)
  try {
    let cfg = null;
    if (window.codivebox?.readConfig) {
      cfg = await window.codivebox.readConfig();
    } else {
      const resp = await fetch("config.json");
      cfg = await resp.json();
    }
    if (cfg && Object.keys(cfg).length > 0) {
      if (apiUrlInput) apiUrlInput.value = cfg.url || "";
      if (apiKeyInput) apiKeyInput.value = cfg.api || "";
      if (temperatureSlider) { temperatureSlider.value = cfg.temperature || 0.7; if (temperatureVal) temperatureVal.value = cfg.temperature || 0.7; }
      if (maxTokensSlider) { maxTokensSlider.value = cfg.max_tokens || 4096; if (maxTokensVal) maxTokensVal.value = cfg.max_tokens || 4096; }
      if (topPSlider) { topPSlider.value = cfg.top_p || 0.9; if (topPVal) topPVal.value = cfg.top_p || 0.9; }
      if (systemPromptEl) systemPromptEl.value = cfg.system_prompt || "";
      if (statusConnection) statusConnection.innerHTML = '<span class="status-dot online"></span>';
    }
  } catch(e) {
    if (statusConnection) statusConnection.innerHTML = '<span class="status-dot offline"></span>';
    appendOutput("warn", "Could not load config: " + e.message);
  }
}

// ─── Command Palette ──────────────────────────────────────────────────────────
function openCommandPalette() {
  cmdPalette.classList.remove("hidden");
  cmdPaletteInput.value = "";
  cmdPaletteInput.focus();
  renderCommands("");
}
function closeCommandPalette() { cmdPalette.classList.add("hidden"); }

const commands = [
  { name: "New File", action: () => { const n=prompt("New file:","new-file.js"); if(n){const e=n.split(".").pop();const m={py:"python",js:"javascript",ts:"typescript",html:"html",css:"css",json:"json",md:"markdown",sql:"sql",sh:"bash",yaml:"yaml",xml:"xml"};createFile(n,m[e]||"text","");renderFileTree();renderTabs();openFile(n,activePane);} } },
  { name: "Open Folder...", action: openRealFolder },
  { name: "Save File", action: () => saveActiveFile() },
  { name: "Run Code", action: runCode },
  { name: "Toggle Sidebar", action: () => document.body.classList.toggle("sidebar-hidden") },
  { name: "Toggle Right Panel", action: () => document.body.classList.toggle("right-hidden") },
  { name: "Toggle Bottom Panel", action: () => toggleBottomPanel() },
  { name: "Toggle Terminal", action: () => { toggleBottomPanel(true); const t=document.querySelector('.bottom-tab[data-btab="terminal"]'); if(t)t.click(); } },
  { name: "Format Document", action: () => { const ed=getEditor(); if(ed) ed.execCommand("selectAll"); } },
  { name: "Go to Line...", action: () => { const ed=getEditor(); if(ed) ed.execCommand("jumpToLine"); } },
  { name: "Find", action: () => { const ed=getEditor(); if(ed) ed.execCommand("find"); } },
  { name: "Replace", action: () => { const ed=getEditor(); if(ed) ed.execCommand("replace"); } },
  { name: "Rename File", action: () => { const af=getActiveFile(); const nn=prompt("Rename "+af+" to:",af); if(nn&&nn!==af){renameFile(af,nn);renderFileTree();renderTabs();openFile(nn,activePane);} } },
  { name: "Delete File", action: () => { const af=getActiveFile(); if(confirm("Delete "+af+"?")){deleteFile(af);renderFileTree();renderTabs();} } },
  { name: "Keyboard Shortcuts", action: () => toggleShortcuts() },
  { name: "Settings", action: () => settingsModal.classList.remove("hidden") },
  { name: "Toggle Theme", action: () => { const l=document.body.classList.toggle("light-theme"); localStorage.setItem("theme",l?"light":"dark"); } },
];

function renderCommands(q) {
  cmdPaletteList.innerHTML = "";
  const filtered = q ? commands.filter(c => c.name.toLowerCase().includes(q.toLowerCase())) : commands;
  filtered.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "cmd-item" + (i === 0 ? " active" : "");
    div.textContent = c.name;
    div.addEventListener("click", () => { closeCommandPalette(); setTimeout(c.action, 50); });
    cmdPaletteList.appendChild(div);
  });
}

cmdPaletteInput?.addEventListener("input", () => renderCommands(cmdPaletteInput.value));
cmdPaletteInput?.addEventListener("keydown", e => {
  if (e.key === "Escape") closeCommandPalette();
  if (e.key === "Enter") { const a = cmdPaletteList.querySelector(".cmd-item.active"); if (a) a.click(); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const items = [...cmdPaletteList.querySelectorAll(".cmd-item")];
    const idx = items.findIndex(i => i.classList.contains("active"));
    items.forEach(i => i.classList.remove("active"));
    const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next].classList.add("active"); items[next].scrollIntoView({ block: "nearest" });
  }
});
cmdPalette?.addEventListener("click", e => { if (e.target === cmdPalette) closeCommandPalette(); });

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
function toggleShortcuts() { $("#shortcutsModal").classList.toggle("hidden"); }
$("#shortcutsClose")?.addEventListener("click", () => $("#shortcutsModal").classList.add("hidden"));
$(".shortcuts-overlay")?.addEventListener("click", () => $("#shortcutsModal").classList.add("hidden"));

window.addEventListener("blur", () => { if (autoSaveMode === "onFocusChange") { saveActiveFile(); renderTabs(); } });

// ─── Keyboard handler ─────────────────────────────────────────────────────────
function isEditingInput() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  if (el.closest(".CodeMirror")) return true;
  return false;
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeCommandPalette(); settingsModal.classList.add("hidden"); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "p" && !e.shiftKey) { e.preventDefault(); openCommandPalette(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && !e.shiftKey) { e.preventDefault(); saveActiveFile(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCode(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "j") { e.preventDefault(); toggleBottomPanel(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "b") { e.preventDefault(); document.body.classList.toggle("sidebar-hidden"); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); document.body.classList.toggle("right-hidden"); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "E") { e.preventDefault(); document.body.classList.remove("sidebar-hidden"); switchSidebar("explorer"); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") { e.preventDefault(); document.body.classList.remove("sidebar-hidden"); switchSidebar("search"); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); settingsModal.classList.remove("hidden"); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && !e.shiftKey) { e.preventDefault(); createItemInFolder(getNewItemFolder(), "file"); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w" && !e.shiftKey) { e.preventDefault(); const af = getActiveFile(); if (af) closeTab(af); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "Tab") { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); return; }
  if (!isEditingInput() && e.key === "F2") {
    e.preventDefault();
    if (lastTreeSelection) startInlineRename(lastTreeSelection.path, lastTreeSelection.type);
    return;
  }
  if (!isEditingInput() && (e.key === "Delete" || e.key === "Del")) {
    e.preventDefault();
    if (lastTreeSelection) {
      if (lastTreeSelection.type === "file") { deleteFile(lastTreeSelection.path); renderFileTree(); renderTabs(); }
      else { deleteFolder(lastTreeSelection.path); renderFileTree(); }
    }
    return;
  }
});

// ─── Terminal ─────────────────────────────────────────────────────────────────
let term = null, termInit = false;
function initTerminal() {
  if (termInit) return; termInit = true;
  if (typeof Terminal === "undefined") return;
  const container = document.getElementById("terminalContainer") || document.getElementById("btabTerminal");
  if (!container) return;
  term = new Terminal({ cursorBlink:true, fontFamily:'JetBrains Mono,monospace', fontSize:13, theme:{ background:'#1e1e1e', foreground:'#e0e0e0' } });
  term.open(container);
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon); fitAddon.fit();
  if (window.codivebox) {
    window.codivebox.termStart();
    window.codivebox.onMenuAction("term-data", (data) => { if (term) term.write(data); });
    term.onData((data) => { window.codivebox?.termInput(data); });
  }
  new ResizeObserver(() => { try { fitAddon.fit(); } catch(e) {} }).observe(container);
}

// ─── Panel resize handlers ────────────────────────────────────────────────────
let rsz = null, rszXY = 0, rszSZ = 0;

// Sidebar resize
const sbResize = document.getElementById("sidebarResize");
sbResize?.addEventListener("mousedown", e => {
  rsz = "sidebar"; rszXY = e.clientX; rszSZ = parseInt(getComputedStyle(document.body).getPropertyValue("--sidebar-width"));
  document.body.style.cursor="col-resize"; document.body.style.userSelect="none"; e.preventDefault();
});

// Right panel resize
const rtResize = document.getElementById("rightResize");
rtResize?.addEventListener("mousedown", e => {
  rsz = "right"; rszXY = e.clientX; rszSZ = parseInt(getComputedStyle(document.body).getPropertyValue("--right-width"));
  document.body.style.cursor="col-resize"; document.body.style.userSelect="none"; e.preventDefault();
});

// Bottom panel resize
const btResize = document.getElementById("bottomResize");
btResize?.addEventListener("mousedown", e => {
  rsz = "bottom"; rszXY = e.clientY; rszSZ = bottomPanel?.offsetHeight || 200;
  document.body.style.cursor="row-resize"; document.body.style.userSelect="none";
});

document.addEventListener("mousemove", e => {
  if (!rsz) return;
  if (rsz === "sidebar") {
    const w = Math.max(200, Math.min(500, rszSZ + (e.clientX - rszXY)));
    document.body.style.setProperty("--sidebar-width", w + "px");
  } else if (rsz === "right") {
    const w = Math.max(250, Math.min(600, rszSZ - (e.clientX - rszXY)));
    document.body.style.setProperty("--right-width", w + "px");
  } else if (rsz === "bottom") {
    const h = Math.max(80, Math.min(500, rszSZ - (e.clientY - rszXY)));
    if (bottomPanel) bottomPanel.style.height = h + "px";
    document.body.style.setProperty("--bottom-height", h + "px");
  }
});
document.addEventListener("mouseup", () => { rsz = null; document.body.style.cursor=""; document.body.style.userSelect=""; });

// ─── Electron integration ────────────────────────────────────────────────────
if (window.codivebox) {
  document.body.classList.add("electron");
  // Window controls
  $("#winMinimize")?.addEventListener("click", () => window.codivebox.minimize());
  $("#winMaximize")?.addEventListener("click", () => window.codivebox.maximize());
  $("#winClose")?.addEventListener("click", () => window.codivebox.close());

  window.codivebox.onMenuAction("win-maximized", isMax => {
    const btn = document.getElementById("winMaximize");
    if (btn) btn.classList.toggle("restore", isMax);
  });

  window.codivebox.onMenuAction("menu-save", () => saveActiveFile());
  window.codivebox.onMenuAction("menu-run", runCode);
  window.codivebox.onMenuAction("live-server-started", data => { appendOutput("success", "Live Server at " + data.url); });
} else {
  // Browser mode — hide window controls
  const wc = document.getElementById("winControls");
  if (wc) wc.style.display = "none";
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  loadFS(); updateProjectName(currentProjectName);
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.body.classList.toggle("light-theme", savedTheme === "light");
  loadAutoSaveSetting();
  appendOutput("info","CodiveBox ready");
  await loadConfig();
  try { await initEditor(); appendOutput("success","Editor ready"); openFile(activeFile1, 1); } catch(e) { appendOutput("error","Editor: "+e.message); renderFileTree(); }
  switchSidebar("explorer");
}

init();

// ─── Split Editor ────────────────────────────────────────────────────────────
function createEditorConfig(el, mode) {
  return {
    mode: mode || "python", theme: "df", lineNumbers: true, matchBrackets: true, autoCloseBrackets: true,
    styleActiveLine: true, indentUnit: 4, tabSize: 4, viewportMargin: Infinity,
    foldGutter: true, gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    extraKeys: {
      "Ctrl-Space": "autocomplete",
      "Ctrl-F": function(cm) { cm.execCommand("find"); },
      "Ctrl-H": function(cm) { cm.execCommand("replace"); },
      "Ctrl-G": function(cm) { cm.execCommand("jumpToLine"); },
      "Tab": function(cm) { if (cm.somethingSelected()) cm.indentSelection("add"); else cm.replaceSelection("    ", "end"); },
    },
    hintOptions: {
      completeSingle: false,
      hint: function(cm) {
        const mode = cm.getModeAt(cm.getCursor()).name;
        const modeHints = {
          "python": CodeMirror.hint.python,
          "javascript": CodeMirror.hint.javascript,
          "typescript": CodeMirror.hint.javascript,
          "text/x-sql": CodeMirror.hint.sql,
          "css": CodeMirror.hint.css,
          "htmlmixed": CodeMirror.hint.html,
          "xml": CodeMirror.hint.xml,
        };
        const fn = modeHints[mode];
        return fn ? fn(cm) : CodeMirror.hint.anyword(cm);
      }
    },
  };
}

function initEditor2() {
  const el2 = document.getElementById("editor2"); if (!el2) return;
  if (editor2) return;
  let config = createEditorConfig(el2, "text");
  if (activeFile2 && fileSystem[activeFile2]) {
    const f = fileSystem[activeFile2];
    const modes = { python:"python", javascript:"javascript", js:"javascript", html:"htmlmixed", css:"css", json:"application/json", markdown:"markdown", typescript:"application/typescript", sql:"text/x-sql", bash:"text/x-sh", yaml:"text/x-yaml", xml:"xml" };
    config.mode = modes[f.language] || "text";
  }
  editor2 = CodeMirror(el2, config);
  editor2.on("change", () => {
    if (editor2 && activeFile2 && fileSystem[activeFile2]) {
      fileSystem[activeFile2].content = editor2.getValue();
      fileSystem[activeFile2]._dirty = true;
    }
  });
  editor2.on("cursorActivity", () => {
    if (activePane !== 2 || !editor2) return;
    const cur = editor2.getCursor();
    if (statusLineCol) statusLineCol.textContent = "Ln " + (cur.line+1) + ", Col " + (cur.ch+1);
  });
  editor2.on("change", function(cm, change) {
    if (change.origin !== "+input" && change.origin !== "paste") return;
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    const word = token.string;
    if (word.length >= 2 && change.text && change.text.length === 1) {
      CodeMirror.commands.autocomplete(cm);
    }
  });
  editor2.on("renderLine", function(cm, line, elt) {
    const indent = line.text.match(/^\s*/)[0].length;
    const unit = cm.getOption("indentUnit") || 4;
    const cw = cm.defaultCharWidth() || 8.4;
    elt.querySelectorAll(".cm-indent-guide").forEach(e => e.remove());
    for (let i = 1; i * unit <= indent; i++) {
      const g = document.createElement("div");
      g.className = "cm-indent-guide";
      g.style.left = (4 + i * unit * cw) + "px";
      g.style.height = elt.offsetHeight + "px";
      elt.appendChild(g);
    }
  });
  setTimeout(() => editor2.refresh(), 100);
}

function toggleSplit() {
  const isOpen = document.body.classList.contains("split-open");
  if (!isOpen) {
    document.body.classList.add("split-open");
    initEditor2();
    if (!activeFile2 && openFiles2.length === 0 && activeFile1 && fileSystem[activeFile1]) {
      openFiles2.push(activeFile1); activeFile2 = activeFile1;
      editor2.setOption("mode", editor.getOption("mode"));
      editor2.setValue(fileSystem[activeFile1].content);
    }
    setTimeout(() => { if (editor2) editor2.refresh(); }, 100);
    appendOutput("info", "Split editor opened");
  } else {
    document.body.classList.remove("split-open");
    if (activePane === 2) activePane = 1;
    renderTabs();
    appendOutput("info", "Split editor closed");
  }
}

// Click on editor panes to switch active pane
document.getElementById("editorPane1")?.addEventListener("click", function(e) {
  if (e.target.closest(".cm-indent-guide")) return;
  if (activePane !== 1) { activePane = 1; renderTabs(); updateBreadcrumbs(); updateStatusBar(); }
});
document.getElementById("editorPane2")?.addEventListener("click", function(e) {
  if (e.target.closest(".cm-indent-guide")) return;
  if (activePane !== 2) { activePane = 2; renderTabs(); updateBreadcrumbs(); updateStatusBar(); }
});

function updateStatusBar() {
  const ed = getEditor(); const af = getActiveFile();
  if (!ed || !af) return;
  if (fileSystem[af]) {
    if (statusLanguage) statusLanguage.textContent = fileSystem[af].language.charAt(0).toUpperCase() + fileSystem[af].language.slice(1);
  }
  const cur = ed.getCursor();
  if (statusLineCol) statusLineCol.textContent = "Ln " + (cur.line+1) + ", Col " + (cur.ch+1);
}
