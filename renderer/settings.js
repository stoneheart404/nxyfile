// ─── SVG Icon Helpers ───
function svgIcon(id, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><use href="#${id}"/></svg>`
}

// ─── Window Controls ───
document.getElementById('btn-min').addEventListener('click', () => window.api.minimize())
document.getElementById('btn-max').addEventListener('click', () => window.api.maximize())
document.getElementById('btn-close').addEventListener('click', () => window.api.close())

document.getElementById('btn-settings').addEventListener('click', () => openSettings())

// ─── Provider defaults ───
const providerDefaults = {
  openai: { model: 'gpt-4o-mini', baseURL: '' },
  anthropic: { model: 'claude-sonnet-4-20250514', baseURL: '' },
  ollama: { model: 'llama3.2', baseURL: '' },
  opencode: { model: 'deepseek-v4-pro', baseURL: 'https://opencode.ai/zen/go/v1' },
  openrouter: { model: 'openai/gpt-4o-mini', baseURL: 'https://openrouter.ai/api/v1' },
  deepseek: { model: 'deepseek-chat', baseURL: 'https://api.deepseek.com/v1' },
  groq: { model: 'llama-3.3-70b-versatile', baseURL: 'https://api.groq.com/openai/v1' },
  custom: { model: 'gpt-4o-mini', baseURL: '' }
}

// ─── Settings State ───
const settings = {
  provider: localStorage.getItem('provider') || 'opencode',
  openaiKey: localStorage.getItem('openaiKey') || '',
  anthropicKey: localStorage.getItem('anthropicKey') || '',
  opencodeKey: localStorage.getItem('opencodeKey') || 'sk-J5WKtvnkHLLjPOAsHgCXutiLugifXIkL8BgXxDTt9G1103wSenwyHrBkgtLTKno0',
  openrouterKey: localStorage.getItem('openrouterKey') || '',
  deepseekKey: localStorage.getItem('deepseekKey') || '',
  groqKey: localStorage.getItem('groqKey') || '',
  customKey: localStorage.getItem('customKey') || '',
  ollamaModel: localStorage.getItem('ollamaModel') || 'llama3.2',
  model: localStorage.getItem('model') || 'deepseek-v4-pro',
  baseURL: localStorage.getItem('baseURL') || '',
  confirmDelete: localStorage.getItem('confirmDelete') !== 'false'
}

function getApiKey() {
  switch (settings.provider) {
    case 'openai': return settings.openaiKey
    case 'anthropic': return settings.anthropicKey
    case 'opencode': return settings.opencodeKey
    case 'openrouter': return settings.openrouterKey
    case 'deepseek': return settings.deepseekKey
    case 'groq': return settings.groqKey
    case 'custom': return settings.customKey
    default: return ''
  }
}

function getModel() {
  if (settings.provider === 'ollama') return settings.ollamaModel
  return settings.model || providerDefaults[settings.provider]?.model || ''
}

function getBaseURL() {
  return settings.baseURL || providerDefaults[settings.provider]?.baseURL || ''
}

function saveSettings() {
  localStorage.setItem('provider', settings.provider)
  localStorage.setItem('openaiKey', settings.openaiKey)
  localStorage.setItem('anthropicKey', settings.anthropicKey)
  localStorage.setItem('opencodeKey', settings.opencodeKey)
  localStorage.setItem('openrouterKey', settings.openrouterKey)
  localStorage.setItem('deepseekKey', settings.deepseekKey)
  localStorage.setItem('groqKey', settings.groqKey)
  localStorage.setItem('customKey', settings.customKey)
  localStorage.setItem('ollamaModel', settings.ollamaModel)
  localStorage.setItem('model', settings.model)
  localStorage.setItem('baseURL', settings.baseURL)
  localStorage.setItem('confirmDelete', settings.confirmDelete)
}

// ─── Settings Modal ───
const settingsOverlay = document.getElementById('settings-overlay')
const btnSettingsClose = document.getElementById('btn-settings-close')
const selectProvider = document.getElementById('select-provider')
const inputApiKey = document.getElementById('input-api-key')
const inputModel = document.getElementById('input-model')
const inputBaseURL = document.getElementById('input-base-url')
const settingsApiKey = document.getElementById('settings-api-key')
const settingsModel = document.getElementById('settings-model')
const settingsBaseURL = document.getElementById('settings-base-url')
const settingsOllama = document.getElementById('settings-ollama')
const selectOllamaModel = document.getElementById('select-ollama-model')
const inputConfirmDelete = document.getElementById('input-confirm-delete')
const aiModeIndicator = document.getElementById('ai-mode-indicator')

function openSettings() {
  settingsOverlay.classList.remove('hidden')
  applySettingsUI()
}

function closeSettings() {
  settingsOverlay.classList.add('hidden')
}

function applySettingsUI() {
  selectProvider.value = settings.provider
  inputConfirmDelete.checked = settings.confirmDelete

  const def = providerDefaults[settings.provider] || {}
  inputModel.value = getModel()
  inputModel.placeholder = def.model || 'Model ID'

  const isApiProvider = ['openai', 'anthropic', 'opencode', 'openrouter', 'deepseek', 'groq', 'custom'].includes(settings.provider)
  const isOllama = settings.provider === 'ollama'
  const needsBaseURL = settings.provider === 'custom'

  settingsApiKey.classList.toggle('hidden', !isApiProvider)
  settingsModel.classList.toggle('hidden', isOllama)
  settingsBaseURL.classList.toggle('hidden', !needsBaseURL)
  settingsOllama.classList.toggle('hidden', !isOllama)

  inputApiKey.value = getApiKey()
  inputApiKey.placeholder = settings.provider === 'anthropic' ? 'sk-ant-...' : 'API key...'

  if (needsBaseURL) {
    inputBaseURL.value = getBaseURL()
    inputBaseURL.placeholder = 'https://api.example.com/v1'
  }

  if (isOllama) {
    selectOllamaModel.value = settings.ollamaModel
  }

  const labels = {
    openai: 'OpenAI', anthropic: 'Claude', ollama: 'Local', opencode: 'Go',
    openrouter: 'OpenRouter', deepseek: 'DeepSeek', groq: 'Groq', custom: 'Custom'
  }
  aiModeIndicator.textContent = labels[settings.provider] || settings.provider
}

selectProvider.addEventListener('change', () => {
  settings.provider = selectProvider.value
  // Apply defaults when switching
  const def = providerDefaults[settings.provider]
  if (def) {
    settings.model = def.model
    settings.baseURL = def.baseURL
  }
  saveSettings()
  applySettingsUI()
})

inputApiKey.addEventListener('change', () => {
  switch (settings.provider) {
    case 'openai': settings.openaiKey = inputApiKey.value; break
    case 'anthropic': settings.anthropicKey = inputApiKey.value; break
    case 'opencode': settings.opencodeKey = inputApiKey.value; break
    case 'openrouter': settings.openrouterKey = inputApiKey.value; break
    case 'deepseek': settings.deepseekKey = inputApiKey.value; break
    case 'groq': settings.groqKey = inputApiKey.value; break
    case 'custom': settings.customKey = inputApiKey.value; break
  }
  saveSettings()
})

inputModel.addEventListener('change', () => {
  settings.model = inputModel.value
  saveSettings()
})

inputBaseURL.addEventListener('change', () => {
  settings.baseURL = inputBaseURL.value
  saveSettings()
})

selectOllamaModel.addEventListener('change', () => {
  settings.ollamaModel = selectOllamaModel.value
  saveSettings()
})

inputConfirmDelete.addEventListener('change', () => {
  settings.confirmDelete = inputConfirmDelete.checked
  saveSettings()
})

btnSettingsClose.addEventListener('click', closeSettings)
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings()
})

// Refresh Ollama models
document.getElementById('btn-refresh-models').addEventListener('click', async () => {
  const btn = document.getElementById('btn-refresh-models')
  btn.textContent = 'Loading...'
  btn.disabled = true
  try {
    const result = await window.api.aiOllamaList()
    if (result.success) {
      selectOllamaModel.innerHTML = ''
      result.models.forEach(m => {
        const opt = document.createElement('option')
        opt.value = m
        opt.textContent = m
        selectOllamaModel.appendChild(opt)
      })
    }
  } catch (e) {}
  btn.textContent = 'Refresh'
  btn.disabled = false
})

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault()
    openSettings()
  }
})

applySettingsUI()
