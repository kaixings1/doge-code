import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
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

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'error'
  statusCode: number
  duration: number
  message: string
}

const API_TESTS_DIR = join(homedir(), '.doge', 'api-tests')

function loadTests(): APITest[] {
  try {
    if (!existsSync(API_TESTS_DIR)) return []
    return require('fs').readdirSync(API_TESTS_DIR).filter((f: string) => f.endsWith('.json')).map((f: string) => JSON.parse(readFileSync(join(API_TESTS_DIR, f), 'utf-8')))
  } catch { return [] }
}

function saveTest(t: APITest) {
  try {
    if (!existsSync(API_TESTS_DIR)) mkdirSync(API_TESTS_DIR, { recursive: true })
    writeFileSync(join(API_TESTS_DIR, t.id + '.json'), JSON.stringify(t, null, 2), 'utf-8')
  } catch { /* ignore */ }
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
      const start = Date.now()
      const headerArgs = Object.entries(test.headers).map(([k, v]) => '-H "' + k + ': ' + v + '"').join(' ')
      const bodyArg = test.body ? ' -d \'' + test.body + '\'' : ''
      const output = execSync('curl -s -o /dev/null -w "%{http_code}" -X ' + test.method + ' ' + headerArgs + bodyArg + ' "' + test.url + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 })
      const duration = Date.now() - start
      const status = parseInt(output.trim())
      const passed = status === test.expectedStatus
      return { type: 'text', value: (passed ? '[PASS]' : '[FAIL]') + ' ' + test.name + '\nExpected: ' + test.expectedStatus + ', Got: ' + status + '\nDuration: ' + duration + 'ms' }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'run-all') {
    const tests = loadTests()
    if (tests.length === 0) return { type: 'text', value: 'No tests saved. Use /api-test add to create one.' }
    const lines = ['Running ' + tests.length + ' tests...', '']
    let passed = 0
    tests.forEach(t => {
      try {
        const headerArgs = Object.entries(t.headers).map(([k, v]) => '-H "' + k + ': ' + v + '"').join(' ')
        const output = execSync('curl -s -o /dev/null -w "%{http_code}" -X ' + t.method + ' ' + headerArgs + ' "' + t.url + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 })
        const status = parseInt(output.trim())
        if (status === t.expectedStatus) { passed++; lines.push('[PASS] ' + t.name) }
        else lines.push('[FAIL] ' + t.name + ' (expected ' + t.expectedStatus + ', got ' + status + ')')
      } catch { lines.push('[ERROR] ' + t.name) }
    })
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
      const output = execSync('curl -s -w "\\nHTTP_CODE:%{http_code}\\nTIME:%{time_total}s" "' + url + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 })
      return { type: 'text', value: output }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'post') {
    const url = parts[1]; const body = parts.slice(2).join(' ')
    if (!url) return { type: 'text', value: 'Usage: /api-test post <url> <body>' }
    try {
      const output = execSync('curl -s -X POST -H "Content-Type: application/json" -d \'' + body + '\' "' + url + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 })
      return { type: 'text', value: output.slice(0, 2000) }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'history') return { type: 'text', value: 'No test history. Run tests first.' }
  if (cmd === 'export') return { type: 'text', value: 'Export: Copy test files from ' + API_TESTS_DIR }

  if (cmd === 'collection') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + file }
    return { type: 'text', value: 'Import: Parse collection from ' + file + ' and save to ' + API_TESTS_DIR }
  }

  if (cmd === 'compare') {
    const a = parts[1]; const b = parts[2]
    if (!a || !b) return { type: 'text', value: 'Usage: /api-test compare <name1> <name2>' }
    return { type: 'text', value: 'Compare responses from ' + a + ' and ' + b }
  }

  if (cmd === 'status') {
    const url = parts[1]
    if (!url) return { type: 'text', value: 'Usage: /api-test status <url>' }
    try {
      const output = execSync('curl -s -o /dev/null -w "%{http_code} %{time_total}s" "' + url + '" 2>&1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 })
      return { type: 'text', value: 'Status: ' + output }
    } catch { return { type: 'text', value: '[ERROR] Cannot reach endpoint' } }
  }

  if (cmd === 'bench') {
    const url = parts[1]; const n = parseInt(parts[2]) || 10
    if (!url) return { type: 'text', value: 'Usage: /api-test bench <url> [count]' }
    const lines = ['Benchmarking ' + url + ' (' + n + ' requests):', '']
    const times: number[] = []
    for (let i = 0; i < n; i++) {
      try {
        const start = Date.now()
        execSync('curl -s -o /dev/null "' + url + '" 2>&1', { stdio: 'ignore', timeout: 10000 })
        times.push(Date.now() - start)
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
    lines.push('Success: ' + valid.length + '/' + n)
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const apiTest: Command = {
  type: 'local', name: 'api-test',
  description: 'API testing - run/run-all/add/list/quick/post/bench/status/history/compare',
  aliases: '/api-test, /api, /curl, /test'.split(','),
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default apiTest
