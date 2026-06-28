let currentDir = null
let selectedFilePath = null
let fileEntries = []

const fileTree = document.getElementById('file-tree')
const currentPathEl = document.getElementById('current-path')
const btnSelectDir = document.getElementById('btn-select-dir')

btnSelectDir.addEventListener('click', async () => {
  const dir = await window.api.selectDir()
  if (dir) await scanDirectory(dir)
})

// ─── Navigation ───
document.getElementById('btn-nav-up').addEventListener('click', async () => {
  if (!currentDir) return
  const parent = await window.api.getParent(currentDir)
  if (parent) await scanDirectory(parent)
})

document.getElementById('btn-nav-root').addEventListener('click', async () => {
  const drives = await window.api.getDrives()
  if (drives.success && drives.files.length > 0) {
    currentDir = drives.dirPath
    fileEntries = drives.files
    currentPathEl.textContent = currentDir
    renderFileTree()
  }
})

// ─── Scan Directory ───
async function scanDirectory(dirPath) {
  fileTree.innerHTML = '<div class="tree-status">Scanning...</div>'
  const result = await window.api.scanDir(dirPath)
  if (!result.success) {
    fileTree.innerHTML = `<div class="tree-status" style="color:var(--danger)">Error: ${result.error}</div>`
    return
  }
  currentDir = result.dirPath
  fileEntries = result.files
  currentPathEl.textContent = currentDir
  renderFileTree()
}

function renderFileTree() {
  fileTree.innerHTML = ''

  const sorted = [...fileEntries].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })

  sorted.forEach(entry => {
    const el = document.createElement('div')
    el.className = `file-entry ${entry.isDirectory ? 'dir' : 'file'}`
    el.dataset.path = entry.path
    el.dataset.isDir = entry.isDirectory

    const iconId = getFileIconId(entry)
    const sizeStr = entry.isDirectory ? '' : formatSize(entry.size)

    el.innerHTML = `<span class="file-icon">${svgIcon(iconId)}</span><span class="file-name">${entry.name}</span><span class="file-size">${sizeStr}</span>`

    el.addEventListener('click', async () => {
      document.querySelectorAll('.file-entry.selected').forEach(e => e.classList.remove('selected'))
      el.classList.add('selected')
      selectedFilePath = entry.path
      if (entry.isDirectory) await scanDirectory(entry.path)
      else if (typeof previewFile === 'function') previewFile(entry.path)
    })

    el.addEventListener('contextmenu', (e) => e.preventDefault())
    fileTree.appendChild(el)
  })

  if (currentDir && typeof onDirLoaded === 'function') onDirLoaded(currentDir, fileEntries)
}

function getFileIconId(entry) {
  if (entry.isDirectory) return 'icon-folder'
  const ext = entry.ext
  const map = {
    '.png':'icon-image','.jpg':'icon-image','.jpeg':'icon-image','.gif':'icon-image','.webp':'icon-image','.bmp':'icon-image','.svg':'icon-image','.ico':'icon-image',
    '.mp4':'icon-video','.mov':'icon-video','.avi':'icon-video','.mkv':'icon-video','.webm':'icon-video',
    '.mp3':'icon-audio','.wav':'icon-audio','.flac':'icon-audio','.aac':'icon-audio','.ogg':'icon-audio',
    '.zip':'icon-archive','.rar':'icon-archive','.7z':'icon-archive','.tar':'icon-archive','.gz':'icon-archive',
    '.js':'icon-code','.ts':'icon-code','.py':'icon-code','.html':'icon-code','.css':'icon-code','.json':'icon-code','.xml':'icon-code',
    '.java':'icon-code','.c':'icon-code','.cpp':'icon-code','.rs':'icon-code','.go':'icon-code','.rb':'icon-code','.php':'icon-code',
    '.sh':'icon-code','.ps1':'icon-code','.txt':'icon-file','.md':'icon-file','.log':'icon-file','.pdf':'icon-file','.doc':'icon-file','.docx':'icon-file','.csv':'icon-file'
  }
  return map[ext] || 'icon-file'
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1)+'K'
  if (bytes < 1024*1024*1024) return (bytes/(1024*1024)).toFixed(1)+'M'
  return (bytes/(1024*1024*1024)).toFixed(2)+'G'
}

async function openInExplorer(filePath) { await window.api.openExplorer(filePath) }

function getCurrentFiles() { return { dirPath: currentDir, files: fileEntries } }
