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
  let queuedResponses = []
  let names = ['model-a:latest', 'model-b:latest']
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    if (unavailable) throw new Error('Ollama offline')
    if (url.endsWith('/api/tags')) return Response.json({ models: names.map(name => ({ name })) })
    const request = JSON.parse(options.body)
    return Response.json(queuedResponses.length ? queuedResponses.shift() : { model: request.model, done: true, done_reason: 'stop', message: { content: 'Test interpretation' } })
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
    assert.equal(JSON.parse(calls.at(-1).options.body).options.num_predict, 2048)
    const truncated = { done: true, done_reason: 'length', message: { content: 'An unfinished' } }
    const complete = { done: true, done_reason: 'stop', model: 'model-b:latest', message: { content: 'A complete replacement.' } }
    let before = calls.length
    queuedResponses = [truncated, complete]
    response = await request('/public/chat', { messages, model: 'model-b:latest' })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).content, 'A complete replacement.')
    const attempts = calls.slice(before).filter(call => call.url.endsWith('/api/chat')).map(call => JSON.parse(call.options.body))
    assert.deepEqual(attempts.map(attempt => attempt.options.num_predict), [2048, 4096])
    assert.deepEqual(attempts[0].messages, attempts[1].messages)
    assert.ok(attempts.every(attempt => attempt.model === 'model-b:latest'))
    before = calls.length
    queuedResponses = [truncated, truncated]
    response = await request('/public/chat', { messages })
    assert.equal(response.status, 502)
    const rejected = await response.json()
    assert.equal(rejected.code, 'AI_RESPONSE_TRUNCATED')
    assert.ok(!('content' in rejected))
    assert.equal(calls.slice(before).filter(call => call.url.endsWith('/api/chat')).length, 2)
    queuedResponses = [{ eval_count: 2048, message: { content: 'Legacy cutoff' } }, complete]
    response = await request('/public/chat', { messages })
    assert.equal((await response.json()).content, 'A complete replacement.')
    for (const invalid of [{ done: false, message: { content: 'Unfinished' } }, { done: true, message: { content: '' } }]) {
      queuedResponses = [invalid]
      response = await request('/public/chat', { messages })
      assert.equal(response.status, 502)
      assert.ok(!('content' in await response.json()))
    }
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
    console.log('PASS: model routing, auth, validation, token budgets, bounded truncation retry, incomplete-response rejection, and offline handling')
  } finally {
    global.fetch = originalFetch
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
