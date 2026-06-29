const Anthropic = require('@anthropic-ai/sdk')
const { getSystemPrompt } = require('./shared')

async function chat(messages, apiKey, model = 'claude-sonnet-4-20250514') {
  if (!apiKey) throw new Error('Anthropic API key required')
  const anthropic = new Anthropic({ apiKey })
  const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content
  }))
  const response = await anthropic.messages.create({
    model, max_tokens: 4000, temperature: 0.7,
    system: getSystemPrompt(), messages: userMessages
  })
  return response.content[0].text
}

async function chatStream(messages, apiKey, model, onChunk) {
  const anthropic = new Anthropic({ apiKey })
  const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content
  }))
  const stream = await anthropic.messages.create({
    model, max_tokens: 4000, temperature: 0.7,
    system: getSystemPrompt(), messages: userMessages, stream: true
  })
  let full = ''
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const delta = event.delta.text
      full += delta; onChunk(delta)
    }
  }
  return full
}

module.exports = { chat, chatStream }
