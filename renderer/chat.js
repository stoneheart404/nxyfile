const chatMessages = document.getElementById('chat-messages')
const chatInput = document.getElementById('chat-input')
const btnSend = document.getElementById('btn-send')
const confirmOverlay = document.getElementById('confirm-overlay')
const confirmBody = document.getElementById('confirm-body')
const btnConfirmYes = document.getElementById('btn-confirm-yes')
const btnConfirmNo = document.getElementById('btn-confirm-no')

let chatHistory = []
let pendingActions = []
let isProcessing = false
let streamMsgEl = null

btnSend.addEventListener('click', sendMessage)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
})

async function sendMessage() {
  const text = chatInput.value.trim()
  if (!text || isProcessing) return

  chatInput.value = ''
  addMessage('user', text)
  chatHistory.push({ role: 'user', content: text })

  // Limit history to last 20 messages
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20)

  const contextMsg = buildContextMessage()
  const fullMessages = [contextMsg, ...chatHistory]
  const provider = settings.provider

  isProcessing = true

  // Create streaming message placeholder
  streamMsgEl = document.createElement('div')
  streamMsgEl.className = 'chat-msg ai streaming'
  streamMsgEl.innerHTML = '<div class="stream-thinking"><span class="thinking-dot"></span> Thinking...</div><div class="stream-content"></div>'
  chatMessages.appendChild(streamMsgEl)
  chatMessages.scrollTop = chatMessages.scrollHeight

  let fullText = ''
  let hasReceivedChunks = false
  const thinkingEl = streamMsgEl.querySelector('.stream-thinking')
  const contentEl = streamMsgEl.querySelector('.stream-content')

  // Timeout fallback - if no response in 90s, cancel
  const timeout = setTimeout(() => {
    if (!hasReceivedChunks && isProcessing) {
      window.api.removeAiListeners()
      isProcessing = false
      if (streamMsgEl) { streamMsgEl.remove(); streamMsgEl = null }
      addMessage('system', 'Request timed out - no response from AI. Check your connection and API key.')
    }
  }, 90000)

  window.api.removeAiListeners()

  window.api.onAiChunk(({ text: chunk }) => {
    hasReceivedChunks = true
    fullText += chunk
    contentEl.innerHTML = `<div class="stream-raw">${escapeHtml(fullText).replace(/\n/g, '<br>')}</div>`
    thinkingEl.innerHTML = '<span class="thinking-dot done"></span> Receiving...'
    chatMessages.scrollTop = chatMessages.scrollHeight
  })

  const complete = (success, finalContent, error) => {
    clearTimeout(timeout)
    window.api.removeAiListeners()
    isProcessing = false

    if (streamMsgEl) {
      streamMsgEl.remove()
      streamMsgEl = null
    }

    if (success && finalContent) {
      chatHistory.push({ role: 'assistant', content: finalContent })
      if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20)
      const parsed = parseAIResponse(finalContent)
      addMessage('ai', parsed.message, parsed.actions, parsed.thinking)

      const autoActions = (parsed.actions || []).filter(a => a.type === 'scan' || a.type === 'read')
      ;(async () => {
        for (const action of autoActions) await executeSingleAction(action)
      })()
    } else {
      if (finalContent && !success) {
        addMessage('ai', finalContent)
      }
      addMessage('system', `Error: ${error || 'No response from AI'}`)
    }
  }

  window.api.onAiDone(({ success, content: finalContent, error }) => {
    complete(success, finalContent, error)
  })

  // Start stream
  window.api.aiStream({
    provider,
    messages: fullMessages,
    apiKey: getApiKey(),
    model: getModel(),
    baseURL: getBaseURL()
  })
}

function buildContextMessage() {
  const { dirPath, files } = getCurrentFiles()
  if (!dirPath) {
    return { role: 'system', content: 'No directory selected. Tell user to click the monitor icon (browse drives) or folder icon to pick a folder.' }
  }

  const dirs = files.filter(f => f.isDirectory)
  const regularFiles = files.filter(f => !f.isDirectory)
  const fileCount = regularFiles.length
  const totalSize = regularFiles.reduce((s, f) => s + (f.size || 0), 0)

  // Safe category labels (prevent model from thinking files are input to process)
  function safeLabel(f) {
    if (f.isDirectory) return '[DIR]'
    const e = (f.ext || '').toLowerCase()
    if (['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg','.ico','.psd','.heic'].includes(e)) return '[IMG]'
    if (['.mp4','.mov','.avi','.mkv','.webm','.wmv','.flv'].includes(e)) return '[VID]'
    if (['.mp3','.wav','.flac','.aac','.ogg','.wma'].includes(e)) return '[AUD]'
    if (['.zip','.rar','.7z','.tar','.gz','.bz2','.xz','.iso'].includes(e)) return '[ARC]'
    if (['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.md','.csv','.rtf'].includes(e)) return '[DOC]'
    if (['.js','.ts','.py','.html','.css','.json','.xml','.java','.c','.cpp','.rs','.go','.rb','.php','.sh','.sql','.swift','.kt','.yaml','.yml','.toml'].includes(e)) return '[CODE]'
    if (['.exe','.dll','.msi','.apk','.app','.bat','.ps1','.lnk'].includes(e)) return '[APP]'
    return '[FILE]'
  }

  // Build compact listing with sanitized names for binary files
  const MAX_SHOW = 200
  const shown = files.slice(0, MAX_SHOW)
  const fileList = shown.map(f => {
    const size = f.isDirectory ? '' : ` ${formatSize(f.size)}`
    const label = safeLabel(f)
    // For binary files, hide the dot in extension to prevent model from seeing image refs
    const isBinary = ['[IMG]','[VID]','[AUD]','[ARC]','[APP]'].includes(label)
    const name = isBinary ? f.name.replace(/\.([a-z0-9]+)$/i, '_$1') : f.name
    return `  ${label} ${name}${size}`
  }).join('\n')

  const hidden = files.length > MAX_SHOW ? `\n  ... and ${files.length - MAX_SHOW} more items not shown` : ''

  return {
    role: 'system',
    content: `CURRENT DIR: ${dirPath}
TOTAL: ${files.length} items (${dirs.length} folders, ${fileCount} files, ${formatSize(totalSize)} total)
CONTENTS:${hidden}
${fileList}

IMPORTANT: The [IMG]/[VID]/[AUD] labels above are just file-type tags. These files cannot be read as text - only listed, moved, or organized. Only [CODE]/[DOC] text files can be read with the "read" action.
Use FULL absolute paths for all actions. If you need more info, use "scan" on specific folders.`
  }
}

function parseAIResponse(text) {
  if (!text) return { thinking: null, message: '', actions: [] }
  // Try direct JSON parse
  try {
    const json = JSON.parse(text)
    return { thinking: json.thinking || null, message: json.message || '', actions: json.actions || [] }
  } catch (e) {}
  // Try extracting JSON from code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      const json = JSON.parse(jsonMatch[1])
      const rest = text.replace(jsonMatch[0], '').trim()
      return { thinking: json.thinking || null, message: json.message || rest || '', actions: json.actions || [] }
    } catch (e2) {}
  }
  // Try finding JSON object anywhere in text
  const jsonObj = text.match(/\{[\s\S]*"actions"[\s\S]*\}/)
  if (jsonObj) {
    try {
      const json = JSON.parse(jsonObj[0])
      const rest = text.replace(jsonObj[0], '').trim()
      return { thinking: json.thinking || null, message: json.message || rest || '', actions: json.actions || [] }
    } catch (e3) {}
  }
  // No JSON found - it's a plain text response. Try to extract thinking if present
  const thinkMatch = text.match(/thinking:?\s*([\s\S]*?)(?=message:?|response:?|answer:?|$)/i)
  return { thinking: thinkMatch ? thinkMatch[1].trim() : null, message: text, actions: [] }
}

function addMessage(type, text, actions = [], thinking = null) {
  const msgEl = document.createElement('div')
  msgEl.className = `chat-msg ${type}`

  if (thinking) {
    const block = document.createElement('div')
    block.className = 'thinking-block'
    block.innerHTML = `
      <div class="thinking-label" onclick="this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('hidden')">
        <svg class="chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg> Thinking
      </div>
      <div class="thinking-content">${escapeHtml(thinking).replace(/\n/g, '<br>')}</div>`
    msgEl.appendChild(block)
  }

  const formatted = text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')

  const body = document.createElement('div')
  body.innerHTML = formatted
  msgEl.appendChild(body)

  if (actions && actions.length > 0) {
    const nonAuto = actions.filter(a => a.type !== 'scan')
    if (nonAuto.length > 0) {
      const actionsEl = document.createElement('div')
      actionsEl.className = 'chat-actions'
      nonAuto.forEach(a => {
        const item = document.createElement('div')
        item.className = 'chat-action-item'
        item.innerHTML = `<span class="action-tag ${a.type==='delete'?'danger':'warn'}">${a.type}</span><span>${a.description||a.path}</span>`
        actionsEl.appendChild(item)
      })
      msgEl.appendChild(actionsEl)

      const btnRow = document.createElement('div')
      btnRow.style.cssText = 'margin-top:12px;display:flex;gap:8px'
      const btnExec = document.createElement('button')
      btnExec.className = 'btn-primary btn-sm'
      btnExec.textContent = 'Execute'
      btnExec.addEventListener('click', () => showConfirmDialog(nonAuto))
      const btnCancel = document.createElement('button')
      btnCancel.className = 'btn-secondary btn-sm'
      btnCancel.textContent = 'Ignore'
      btnCancel.addEventListener('click', () => addMessage('system', 'Ignored.'))
      btnRow.appendChild(btnExec); btnRow.appendChild(btnCancel)
      msgEl.appendChild(btnRow)
    }
  }

  chatMessages.appendChild(msgEl)
  chatMessages.scrollTop = chatMessages.scrollHeight
}

const actionIcons = {
  scan:'icon-search',read:'icon-file',delete:'icon-trash',move:'icon-move',
  copy:'icon-copy',rename:'icon-file',mkdir:'icon-folder',findDuplicates:'icon-search',search:'icon-search',openExplorer:'icon-open'
}

function showConfirmDialog(actions) {
  pendingActions = actions; confirmBody.innerHTML = ''
  const s = document.createElement('p')
  s.style.cssText = 'font-size:12px;margin-bottom:14px;color:var(--text-secondary)'
  s.textContent = `${actions.length} action(s):`
  confirmBody.appendChild(s)
  actions.forEach(a => {
    const item = document.createElement('div')
    item.style.cssText = 'padding:10px 14px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;font-size:12px'
    item.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">${svgIcon(actionIcons[a.type]||'icon-file','')}<span class="action-tag ${a.type==='delete'?'danger':'warn'}">${a.type}</span><span style="color:var(--text-primary)">${a.description||''}</span></div>` +
      (a.path?`<div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);word-break:break-all">${a.path}</div>`:'') +
      (a.dest?`<div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);word-break:break-all">to: ${a.dest}</div>`:'')
    confirmBody.appendChild(item)
  })
  confirmOverlay.classList.remove('hidden')
}

btnConfirmYes.addEventListener('click', async () => {
  confirmOverlay.classList.add('hidden')
  await executeActions(pendingActions); pendingActions = []
})
btnConfirmNo.addEventListener('click', () => {
  confirmOverlay.classList.add('hidden'); pendingActions = []
  addMessage('system', 'Cancelled.')
})
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) { confirmOverlay.classList.add('hidden'); pendingActions = [] }
})

async function executeActions(actions) {
  addMessage('system', `Running ${actions.length} action(s)...`)
  for (const a of actions) await executeSingleAction(a)
  if (currentDir) await scanDirectory(currentDir)
  addMessage('system', 'Done.')
}

async function executeSingleAction(action) {
  try {
    let result
    switch (action.type) {
      case 'scan': {
        if (!action.path) { addMessage('system', 'Skipped scan: no path'); return }
        const exists = await window.api.fileExists(action.path)
        if (!exists) { addMessage('system', `Path not found: ${action.path}`); return }
        await scanDirectory(action.path)
        chatHistory = []
        return
      }
      case 'read':
        result = await window.api.readFile(action.path)
        if (result.success) previewFile(action.path)
        break
      case 'search':
        result = await window.api.searchFiles(action.path || currentDir, action.pattern || '*', 5)
        if (result.success && result.files.length > 0) {
          addMessage('system', `Found ${result.total} file(s) matching "${action.pattern}"`)
          if (currentDir) { currentDir = result.dirPath; fileEntries = result.files; renderFileTree() }
        } else if (result.success) addMessage('system', `No files matching "${action.pattern}"`)
        break
      case 'delete':
        if (settings.confirmDelete) {
          if (!confirm(`Move to trash: ${action.path}?`)) { addMessage('system', `Skipped: ${action.path}`); return }
        }
        result = await window.api.deleteFile(action.path)
        break
      case 'move': result = await window.api.moveFile(action.path, action.dest); break
      case 'copy': result = await window.api.copyFile(action.path, action.dest); break
      case 'rename': result = await window.api.renameFile(action.path, action.dest); break
      case 'mkdir': result = await window.api.mkdir(action.path); break
      case 'findDuplicates':
        result = await window.api.findDuplicates(action.path)
        if (result.success && result.duplicates.length > 0) {
          let msg = `Found ${result.duplicates.length} duplicate(s):\n`
          result.duplicates.forEach(d => { msg += `\n- ${d.duplicate}\n  (dup of ${d.original})` })
          addMessage('ai', msg)
        } else if (result.success) addMessage('system', 'No duplicates found.')
        break
      case 'openExplorer': result = await window.api.openExplorer(action.path); break
    }
    if (result && result.success === false) addMessage('system', `Failed: ${action.type} - ${result.error}`)
  } catch (e) { addMessage('system', `Error on ${action.type}: ${e.message}`) }
}

addMessage('ai', `Nyxfile is ready.

Full device access. Chat to manage your files.

<strong>To start:</strong>
1. Click the monitor icon to browse all drives
2. Or the folder icon to pick a specific directory
3. Describe what you need`)

setTimeout(() => addMessage('system', 'Browse a folder or drive to begin.'), 600)

function onDirLoaded() {}
