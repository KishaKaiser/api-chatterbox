const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const express = require('express')

process.env.PUBLIC_API_KEY = 'test-key'
process.env.OLLAMA_MODEL = 'model-a:latest'
const sourcePath = path.resolve(__dirname, '../src/routes/public-chat.ts')
const source = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
}).outputText
const loaded = new Module(sourcePath, module)
loaded.filename = sourcePath
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath))
loaded._compile(source, sourcePath)
const app = express()
app.use(express.json())
app.use(loaded.exports.default)

async function main() {
  const originalFetch = global.fetch
  const calls = []
  let unavailable = false
  let names = ['model-a:latest', 'model-b:latest']
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    if (unavailable) throw new Error('Ollama offline')
    if (url.endsWith('/api/tags')) return Response.json({ models: names.map(name => ({ name })) })
    const request = JSON.parse(options.body)
    return Response.json({ model: request.model, message: { content: 'Test interpretation' } })
  }
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  const request = (route, body, key = 'test-key') => originalFetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const messages = [{ role: 'user', content: 'Test chart' }]
  try {
    assert.equal((await request('/public/models', undefined, 'wrong')).status, 401)
    assert.equal((await request('/public/chat', { messages }, 'wrong')).status, 401)
    assert.equal(calls.length, 0)
    let response = await request('/public/models')
    assert.deepEqual(await response.json(), { models: names.map(name => ({ name })), defaultModel: 'model-a:latest' })
    response = await request('/public/chat', { messages })
    assert.equal((await response.json()).model, 'model-a:latest')
    response = await request('/public/chat', { messages, model: 'model-b:latest' })
    assert.equal((await response.json()).model, 'model-b:latest')
    assert.equal(JSON.parse(calls.at(-1).options.body).model, 'model-b:latest')
    assert.equal((await request('/public/chat', { messages, model: 'missing' })).status, 400)
    assert.equal((await request('/public/chat', { messages, model: 5 })).status, 400)
    assert.equal((await request('/public/chat', { messages, model: '' })).status, 400)
    assert.equal((await request('/public/chat', { messages: [] })).status, 400)
    names = []
    response = await request('/public/models')
    assert.deepEqual((await response.json()).models, [])
    unavailable = true
    assert.equal((await request('/public/models')).status, 502)
    assert.equal((await request('/public/chat', { messages, model: 'model-b:latest' })).status, 502)
    console.log('PASS: model listing, default and explicit selection, authentication, validation, empty list, and offline service')
  } finally {
    global.fetch = originalFetch
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
