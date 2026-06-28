const { getSystemPrompt } = require('./shared')

async function chat(messages, apiKey, baseURL, model = 'gpt-4o-mini') {
  if (!apiKey) throw new Error('API key required')
  if (!baseURL) throw new Error('Base URL required')
  const url = baseURL.replace(/\/+$/, '') + '/chat/completions'
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: getSystemPrompt() }, ...messages], temperature: 0.7, max_tokens: 4000 })
  })
  if (!response.ok) { const err = await response.text(); throw new Error(`API ${response.status}: ${err}`) }
  const data = await response.json()
  return data.choices?.[0]?.message?.content || 'No response'
}

async function chatStream(messages, apiKey, baseURL, model, onChunk) {
  if (!apiKey) throw new Error('API key required')
  const url = (baseURL || '').replace(/\/+$/, '') + '/chat/completions'
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: getSystemPrompt() }, ...messages], temperature: 0.7, max_tokens: 4000, stream: true })
  })
  if (!response.ok) { const err = await response.text(); throw new Error(`API ${response.status}: ${err}`) }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let full = '', buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const s = line.trim()
      if (!s.startsWith('data: ')) continue
      const jsonStr = s.slice(6)
      if (jsonStr === '[DONE]') continue
      try {
        const json = JSON.parse(jsonStr)
        const delta = json.choices?.[0]?.delta?.content || ''
        if (delta) { full += delta; onChunk(delta) }
      } catch (e) {}
    }
  }
  return full
}

module.exports = { chat, chatStream }
