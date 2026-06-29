const { getSystemPrompt } = require('./shared')

async function chat(messages, model = 'llama3.2') {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: getSystemPrompt() }, ...messages], stream: false })
  })
  const data = await response.json()
  return data.message?.content || 'No response'
}

async function chatStream(messages, model, onChunk) {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: getSystemPrompt() }, ...messages], stream: true })
  })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      try {
        const json = JSON.parse(line)
        const delta = json.message?.content || ''
        if (delta) { full += delta; onChunk(delta) }
      } catch (e) {}
    }
  }
  return full
}

async function listModels() {
  const response = await fetch('http://localhost:11434/api/tags')
  const data = await response.json()
  return data.models?.map(m => m.name) || []
}

module.exports = { chat, chatStream, listModels }
