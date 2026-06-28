const { OpenAI } = require('openai')
const { getSystemPrompt } = require('./shared')

async function chat(messages, apiKey, model = 'gpt-4o-mini') {
  if (!apiKey) throw new Error('OpenAI API key required')
  const openai = new OpenAI({ apiKey })
  const response = await openai.chat.completions.create({
    model, messages: [{ role: 'system', content: getSystemPrompt() }, ...messages],
    temperature: 0.7, max_tokens: 4000
  })
  return response.choices[0].message.content
}

async function chatStream(messages, apiKey, model, onChunk) {
  const openai = new OpenAI({ apiKey })
  const stream = await openai.chat.completions.create({
    model, messages: [{ role: 'system', content: getSystemPrompt() }, ...messages],
    temperature: 0.7, max_tokens: 4000, stream: true
  })
  let full = ''
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || ''
    if (delta) { full += delta; onChunk(delta) }
  }
  return full
}

module.exports = { chat, chatStream }
