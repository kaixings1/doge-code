import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface APITest {
  id: string
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body: string
  expectedStatus: number
  tags: string[]
}

interface HttpResponse {
  status: number
  body: string
  headers: Record<string, string>
  durationMs: number
  ok: boolean
}

const API_TESTS_DIR = join(homedir(), '.doge', 'api-tests')

function loadTests(): APITest[] {
  try {
    if (!existsSync(API_TESTS_DIR)) return []
    const fs = require('fs')
    return fs.readdirSync(API_TESTS_DIR).filter((f: string) => f.endsWith('.json')).map((f: string) => JSON.parse(readFileSync(join(API_TESTS_DIR, f), 'utf-8')))
  } catch { return [] }
}

function saveTest(t: APITest) {
  try {
    if (!existsSync(API_TESTS_DIR)) mkdirSync(API_TESTS_DIR, { recursive: true })
    writeFileSync(join(API_TESTS_DIR, t.id + '.json'), JSON.stringify(t, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

/**
 * 使用原生 fetch 发送 HTTP 请求
 */
async function httpRequest(method: string, url: string, headers: Record<string, string> = {}, body?: string, timeoutMs = 15000): Promise<HttpResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const start = Date.now()
    const headersObj: Record<string, string> = { ...headers }
    if (body) headersObj['Content-Type'] = headersObj['Content-Type'] || 'application/json'
    const res = await fetch(url, {
      method,
      headers: headersObj,
      body: body || undefined,
      signal: controller.signal,
      redirect: 'follow',
    })
    const text = await res.text()
    const durationMs = Date.now() - start
    const resHeaders: Record<string, string> = {}
    res.headers.forEach((v, k) => { resHeaders[k] = v })
    return { status: res.status, body: text, headers: resHeaders, durationMs, ok: res.ok }
  } finally {
    clearTimeout(timeout)
  }
}

function recordHistory(name: string, status: string, duration: number) {
  try {
    const historyFile = join(API_TESTS_DIR, 'history.json')
    let history: any[] = []
    if (existsSync(historyFile)) history = JSON.parse(readFileSync(historyFile, 'utf-8'))
    history.push({ name, status, duration, timestamp: new Date().toISOString() })
    if (history.length > 100) history = history.slice(-100)
    if (!existsSync(API_TESTS_DIR)) mkdirSync(API_TESTS_DIR, { recursive: true })
    writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

function formatResponse(res: HttpResponse, maxLen = 2000): string {
  const bodyPreview = res.body.length > maxLen ? res.body.slice(0, maxLen) + `... (${res.body.length} bytes total)` : res.body
  return `Status: ${res.status}${res.ok ? ' ✅' : ' ❌'}\nDuration: ${res.durationMs}ms\n\n${bodyPreview}`
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['API Test', '', 'Usage:', '  /api-test run <name>             Run a saved test', '  /api-test run-all               Run all tests', '  /api-test add                   Add a new test', '  /api-test list                  List saved tests', '  /api-test delete <name>         Delete a test', '  /api-test quick <url>           Quick GET request', '  /api-test post <url> <body>     Quick POST request', '  /api-test history               Test run history', '  /api-test export                Export results', '  /api-test collection <file>     Import collection', '  /api-test compare <a> <b>       Compare responses', '  /api-test status <url>          Check endpoint status', '  /api-test bench <url> [N]       Benchmark endpoint', ''].join('\n') }

  if (cmd === 'run') {
    const name = parts.slice(1).join(' ')
    const tests = loadTests()
    const test = tests.find(t => t.name.toLowerCase().includes(name.toLowerCase()))
    if (!test) return { type: 'text', value: 'Test not found: ' + name }
    try {
      const res = await httpRequest(test.method, test.url, test.headers, test.body, 30000)
      const passed = res.status === test.expectedStatus
      recordHistory(test.name, passed ? 'pass' : 'fail', res.durationMs)
      return { type: 'text', value: (passed ? '[PASS]' : '[FAIL]') + ' ' + test.name + '\nExpected: ' + test.expectedStatus + ', Got: ' + res.status + '\nDuration: ' + res.durationMs + 'ms' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { type: 'text', value: '[ERROR] ' + msg }
    }
  }

  if (cmd === 'run-all') {
    const tests = loadTests()
    if (tests.length === 0) return { type: 'text', value: 'No tests saved. Use /api-test add to create one.' }
    const lines = ['Running ' + tests.length + ' tests...', '']
    let passed = 0
    for (const t of tests) {
      try {
        const res = await httpRequest(t.method, t.url, t.headers, t.body, 15000)
        if (res.status === t.expectedStatus) { passed++; lines.push('[PASS] ' + t.name) }
        else lines.push('[FAIL] ' + t.name + ' (expected ' + t.expectedStatus + ', got ' + res.status + ')')
        recordHistory(t.name, res.status === t.expectedStatus ? 'pass' : 'fail', res.durationMs)
      } catch (err) {
        lines.push('[ERROR] ' + t.name + ': ' + (err instanceof Error ? err.message : 'timeout'))
        recordHistory(t.name, 'error', 0)
      }
    }
    lines.push('', 'Results: ' + passed + '/' + tests.length + ' passed')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add') {
    return { type: 'text', value: 'To add a test, create JSON in ' + API_TESTS_DIR + ':\n{\n  "id": "test-1",\n  "name": "Get Users",\n  "method": "GET",\n  "url": "https://api.example.com/users",\n  "headers": {"Authorization": "Bearer token"},\n  "body": "",\n  "expectedStatus": 200,\n  "tags": ["users"]\n}' }
  }

  if (cmd === 'list') {
    const tests = loadTests()
    if (tests.length === 0) return { type: 'text', value: 'No saved tests' }
    const lines = ['Saved API Tests:', '==================', '']
    tests.forEach(t => lines.push(t.method + ' ' + t.url + ' -> ' + t.expectedStatus + ' (' + t.name + ')'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'delete') {
    const name = parts.slice(1).join(' ')
    const tests = loadTests()
    const test = tests.find(t => t.name.toLowerCase().includes(name.toLowerCase()))
    if (!test) return { type: 'text', value: 'Not found: ' + name }
    try { require('fs').unlinkSync(join(API_TESTS_DIR, test.id + '.json')); return { type: 'text', value: '[OK] Deleted: ' + test.name } }
    catch { return { type: 'text', value: '[ERROR] Delete failed' } }
  }

  if (cmd === 'quick') {
    const url = parts[1]
    if (!url) return { type: 'text', value: 'Usage: /api-test quick <url>' }
    try {
      const res = await httpRequest('GET', url)
      return { type: 'text', value: formatResponse(res) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'post') {
    const url = parts[1]; const body = parts.slice(2).join(' ')
    if (!url) return { type: 'text', value: 'Usage: /api-test post <url> <body>' }
    try {
      const res = await httpRequest('POST', url, {}, body)
      return { type: 'text', value: formatResponse(res) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'history') {
    const historyFile = join(API_TESTS_DIR, 'history.json')
    if (!existsSync(historyFile)) return { type: 'text', value: 'No test history. Run tests first.' }
    try {
      const history = JSON.parse(readFileSync(historyFile, 'utf-8')) as Array<{ name: string; status: string; duration: number; timestamp: string }>
      const lines = ['Test History:', '==================', '']
      history.slice(-20).reverse().forEach((h: any) => lines.push(`[${h.status}] ${h.name} (${h.duration}ms) - ${h.timestamp}`))
      return { type: 'text', value: lines.join('\n') }
    } catch { return { type: 'text', value: 'Error reading history file' } }
  }

  if (cmd === 'export') {
    const tests = loadTests()
    if (tests.length === 0) return { type: 'text', value: 'No tests to export.' }
    const exportPath = join(process.cwd(), 'api-tests-export.json')
    writeFileSync(exportPath, JSON.stringify(tests, null, 2), 'utf-8')
    return { type: 'text', value: 'Exported ' + tests.length + ' tests to ' + exportPath }
  }

  if (cmd === 'collection') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + file }
    try {
      const content = readFileSync(file, 'utf-8')
      const collection = JSON.parse(content)
      const items = collection?.item || collection?.requests || collection?.items || (Array.isArray(collection) ? collection : [collection])
      if (!Array.isArray(items)) return { type: 'text', value: 'Unable to parse collection format from ' + file }
      let imported = 0
      items.forEach((item: any) => {
        const req = item.request || item
        const test: APITest = {
          id: 'test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name: item.name || req.method || 'unnamed',
          method: (req.method || 'GET').toUpperCase(),
          url: req.url?.raw || req.url || '',
          headers: (req.header || []).reduce((acc: any, h: any) => { acc[h.key || h.name] = h.value; return acc }, {}),
          body: item.body || '',
          expectedStatus: 200,
          tags: []
        }
        if (test.url) { saveTest(test); imported++ }
      })
      return { type: 'text', value: 'Imported ' + imported + ' tests from ' + file }
    } catch { return { type: 'text', value: 'Error parsing collection from ' + file } }
  }

  if (cmd === 'compare') {
    const a = parts[1]; const b = parts[2]
    if (!a || !b) return { type: 'text', value: 'Usage: /api-test compare <name1> <name2>' }
    const tests = loadTests()
    const testA = tests.find(t => t.name.toLowerCase().includes(a.toLowerCase()))
    const testB = tests.find(t => t.name.toLowerCase().includes(b.toLowerCase()))
    if (!testA) return { type: 'text', value: 'Test not found: ' + a }
    if (!testB) return { type: 'text', value: 'Test not found: ' + b }
    try {
      const [resA, resB] = await Promise.all([
        httpRequest(testA.method, testA.url, testA.headers, testA.body),
        httpRequest(testB.method, testB.url, testB.headers, testB.body),
      ])
      const lines = ['Comparing: ' + testA.name + ' vs ' + testB.name, '', '']
      lines.push('Test A: ' + testA.name + ' -> ' + resA.status + ' (' + resA.durationMs + 'ms)')
      lines.push('Test B: ' + testB.name + ' -> ' + resB.status + ' (' + resB.durationMs + 'ms)')
      lines.push('')
      lines.push(resA.status === resB.status ? '✅ Same status code' : '❌ Different status codes')
      if (resA.body === resB.body) lines.push('✅ Identical response bodies')
      else lines.push('⚠️ Different response bodies')
      return { type: 'text', value: lines.join('\n') }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'status') {
    const url = parts[1]
    if (!url) return { type: 'text', value: 'Usage: /api-test status <url>' }
    try {
      const res = await httpRequest('GET', url, {}, undefined, 10000)
      return { type: 'text', value: 'Status: ' + res.status + ' (' + res.durationMs + 'ms)' + (res.ok ? ' ✅' : ' ❌') }
    } catch (err) {
      return { type: 'text', value: '[ERROR] Cannot reach endpoint: ' + (err instanceof Error ? err.message : 'timeout') }
    }
  }

  if (cmd === 'bench') {
    const url = parts[1]; const n = parseInt(parts[2]) || 10
    if (!url) return { type: 'text', value: 'Usage: /api-test bench <url> [count]' }
    const lines = ['Benchmarking ' + url + ' (' + n + ' requests):', '']
    const times: number[] = []
    let success = 0
    for (let i = 0; i < n; i++) {
      try {
        const res = await httpRequest('GET', url, {}, undefined, 10000)
        times.push(res.durationMs)
        if (res.ok) success++
      } catch { times.push(-1) }
    }
    const valid = times.filter(t => t >= 0)
    if (valid.length === 0) return { type: 'text', value: 'All requests failed' }
    const avg = Math.round(valid.reduce((s, t) => s + t, 0) / valid.length)
    const min = Math.min(...valid)
    const max = Math.max(...valid)
    lines.push('Average: ' + avg + 'ms')
    lines.push('Min: ' + min + 'ms')
    lines.push('Max: ' + max + 'ms')
    lines.push('Success: ' + success + '/' + n)
    lines.push('Requests/sec: ' + (success / (avg / 1000)).toFixed(1))
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const apiTest: Command = {
  type: 'local', name: 'api-test',
  description: 'API testing - run/run-all/add/list/quick/post/bench/status/history/compare',
  aliases: '/api-test, /api, /curl, /test'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default apiTest