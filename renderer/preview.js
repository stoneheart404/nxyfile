// ─── File Preview ───
const previewContent = document.getElementById('preview-content')

async function previewFile(filePath) {
  previewContent.innerHTML = '<div class="preview-placeholder">Loading...</div>'

  const result = await window.api.readFile(filePath)
  if (!result.success) {
    previewContent.innerHTML = `<div class="preview-placeholder">Error: ${result.error}</div>`
    return
  }

  const sizeStr = formatSize(result.size)
  const dateStr = result.modified ? new Date(result.modified).toLocaleString() : '--'

  let metaHTML = `
    <div class="preview-meta">
      <span><span class="meta-label">Name</span> ${result.name}</span>
      <span><span class="meta-label">Size</span> ${sizeStr}</span>
      <span><span class="meta-label">Type</span> ${result.ext || '--'}</span>
      <span><span class="meta-label">Modified</span> ${dateStr}</span>
    </div>
  `

  let contentHTML = ''

  if (result.previewType === 'image') {
    contentHTML = `<img src="data:image/${result.ext.replace('.', '')};base64,${result.content}" class="preview-image" alt="${result.name}">`
  } else if (result.previewType === 'text') {
    const truncated = result.content.length > 10000
      ? result.content.substring(0, 10000) + '\n\n... truncated'
      : result.content
    contentHTML = `<div class="preview-text">${escapeHtml(truncated)}</div>`
  } else {
    contentHTML = '<div class="preview-placeholder">Binary file</div>'
  }

  const actionsHTML = `
    <div class="preview-actions">
      <button class="btn-secondary btn-sm" onclick="openInExplorer('${escapeAttr(filePath)}')">
        ${svgIcon('icon-open', '')} Open
      </button>
      <button class="btn-secondary btn-sm" onclick="deleteSingleFile('${escapeAttr(filePath)}')">
        ${svgIcon('icon-trash', '')} Delete
      </button>
    </div>
  `

  previewContent.innerHTML = metaHTML + contentHTML + actionsHTML
}

async function deleteSingleFile(filePath) {
  if (settings.confirmDelete) {
    const confirmed = confirm(`Move to trash:\n${filePath}`)
    if (!confirmed) return
  }

  const result = await window.api.deleteFile(filePath)
  if (result.success) {
    previewContent.innerHTML = '<div class="preview-placeholder" style="color:var(--success);">Moved to trash</div>'
    if (currentDir) await scanDirectory(currentDir)
  } else {
    alert('Failed: ' + result.error)
  }
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"')
}
