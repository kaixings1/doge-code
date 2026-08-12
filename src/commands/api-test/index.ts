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
export async function httpRequest(method: string, url: string, headers: Record<string, string> = {}, body?: string, timeoutMs = 15000): Promise<HttpResponse> {
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

/**
 * 带环境变量替换的 HTTP 请求
 */
async function httpRequestResolved(method: string, url: string, headers: Record<string, string> = {}, body?: string, timeoutMs = 15000): Promise<HttpResponse> {
  const resolvedUrl = resolveEnvVars(url)
  const resolvedBody = body ? resolveEnvVars(body) : body
  const resolvedHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    resolvedHeaders[k] = resolveEnvVars(v)
  }
  return httpRequest(method, resolvedUrl, resolvedHeaders, resolvedBody, timeoutMs)
}

/**
 * 替换 URL/body 中的环境变量占位符 ${VAR}
 */
export function resolveEnvVars(input: string): string {
  let result = input
  const pattern = /\$\{([A-Z_][A-Z0-9_]*)\}/g
  result = result.replace(pattern, (match, name) => {
    const envVal = process.env[name]
    return envVal != null ? envVal : match
  })
  return result
}

/**
 * 评估断言表达式
 * 支持: status == 200, status != 404, status >= 500, body contains "xxx", body ~ regex
 */
export function evaluateAssertion(assertion: string, res: HttpResponse): boolean {
  const body = res.body
  if (assertion.includes('body contains')) {
    const target = assertion.split('contains')[1].trim().replace(/^['"]|['"]$/g, '')
    return body.includes(target)
  }
  if (assertion.startsWith('body ~ ')) {
    const pattern = assertion.slice(7).trim().replace(/^['"]|['"]$/g, '')
    try { return new RegExp(pattern).test(body) } catch { return false }
  }
  const statusMatch = assertion.match(/^status\s*(==|!=|>=|<=|>|<)\s*(\d+)$/)
  if (statusMatch) {
    const op = statusMatch[1]
    const expected = parseInt(statusMatch[2])
    switch (op) {
      case '==': return res.status === expected
      case '!=': return res.status !== expected
      case '>=': return res.status >= expected
      case '<=': return res.status <= expected
      case '>': return res.status > expected
      case '<': return res.status < expected
    }
  }
  return true
}

/**
 * 轻量 JSON Schema 验证（支持常见类型）
 */
export function validateJsonSchema(data: any, schema: any): string | null {
  if (schema.type) {
    const valType = Array.isArray(data) ? 'array' : typeof data
    const ok =
      (schema.type === 'number' && valType === 'number') ||
      (schema.type === 'integer' && typeof data === 'number' && Number.isInteger(data)) ||
      (schema.type === 'string' && valType === 'string') ||
      (schema.type === 'boolean' && valType === 'boolean') ||
      (schema.type === 'object' && valType === 'object') ||
      (schema.type === 'array' && valType === 'array') ||
      (schema.type === 'null' && data === null)
    if (!ok) return 'expected ' + schema.type + ', got ' + valType
  }
  if (schema.required && Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (data[key] == null) return 'missing required property: ' + key
    }
  }
  if (schema.properties && data && typeof data === 'object') {
    for (const [key, propSchema] of Object.entries<any>(schema.properties)) {
      if (data[key] != null) {
        const err = validateJsonSchema(data[key], propSchema)
        if (err) return key + ': ' + err
      }
    }
  }
  if (schema.items && Array.isArray(data)) {
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const err = validateJsonSchema(data[i], schema.items)
      if (err) return '[' + i + ']: ' + err
    }
  }
  return null
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

export function formatResponse(res: HttpResponse, maxLen = 2000): string {
  const bodyPreview = res.body.length > maxLen ? res.body.slice(0, maxLen) + `... (${res.body.length} bytes total)` : res.body
  return `Status: ${res.status}${res.ok ? ' ✅' : ' ❌'}\nDuration: ${res.durationMs}ms\n\n${bodyPreview}`
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📖 API 测试', '', '📖 用法：', '  /api-test run <name>             运行已保存的测试', '  /api-test run-all               运行全部测试', '  /api-test add                   添加新测试', '  /api-test list                  列出已保存测试', '  /api-test delete <name>         删除测试', '  /api-test quick <url>           快速 GET 请求', '  /api-test post <url> <body>     快速 POST 请求', '  /api-test history               测试运行历史', '  /api-test export                导出结果', '  /api-test collection <file>     导入集合', '  /api-test compare <a> <b>       对比响应', '  /api-test status <url>          检查端点状态', '  /api-test bench <url> [N]       基准测试端点', ''].join('\n') }

  if (cmd === 'run') {
    const name = parts.slice(1).join(' ')
    const tests = loadTests()
    const test = tests.find(t => t.name.toLowerCase().includes(name.toLowerCase()))
    if (!test) return { type: 'text', value: '❌ 未找到测试：' + name }
    try {
      const res = await httpRequestResolved(test.method, test.url, test.headers, test.body, 30000)
      // 支持自定义断言（tests 中可添加 assertions 数组）+ 响应 Schema 验证
      const assertions = (test as any).assertions
      const responseSchema = (test as any).responseSchema
      let passed: boolean
      let details: string
      if (assertions && assertions.length > 0) {
        const results = assertions.map((a: string) => ({ assertion: a, ok: evaluateAssertion(a, res) }))
        passed = results.every((r: any) => r.ok)
        details = results.map((r: any) => '  ' + (r.ok ? '✅' : '❌') + ' ' + r.assertion).join('\n')
        // 追加 schema 验证结果
        if (responseSchema) {
          let schemaErr: string | null = null
          try { schemaErr = validateJsonSchema(JSON.parse(res.body), responseSchema) } catch { schemaErr = '❌ 响应不是有效的 JSON' }
          if (schemaErr) { passed = false; details += '\n  ❌ Schema：' + schemaErr }
          else details += '\n  ✅ Schema 匹配'
        }
      } else if (responseSchema) {
        let schemaErr: string | null = null
        try { schemaErr = validateJsonSchema(JSON.parse(res.body), responseSchema) } catch { schemaErr = '❌ 响应不是有效的 JSON' }
        passed = res.status === test.expectedStatus && !schemaErr
        details = '  ℹ️ 期望：' + test.expectedStatus + '，实际：' + res.status + (schemaErr ? '\n  ❌ Schema：' + schemaErr : '')
      } else {
        passed = res.status === test.expectedStatus
        details = '  ℹ️ 期望：' + test.expectedStatus + '，实际：' + res.status
      }
      recordHistory(test.name, passed ? 'pass' : 'fail', res.durationMs)
      // 失败时显示响应体摘要（前 500 字符）
      let responseSummary = ''
      if (!passed) {
        const preview = res.body.length > 500 ? res.body.slice(0, 500) + '... (' + res.body.length + ' bytes)' : res.body
        responseSummary = '\n\n📄 响应预览：\n' + (preview || '(empty response)')
      }
      return { type: 'text', value: (passed ? '✅ 通过' : '❌ 失败') + ' ' + test.name + '\n' + details + '\n⏱️ 耗时：' + res.durationMs + 'ms' + responseSummary }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { type: 'text', value: '❌ 错误：' + msg }
    }
  }

  if (cmd === 'run-all') {
    const tests = loadTests()
    if (tests.length === 0) return { type: 'text', value: 'ℹ️ 暂无已保存测试。请使用 /api-test add 创建一个。' }
    const lines = ['🚀 正在运行 ' + tests.length + ' 个测试...', '']
    let passed = 0
    for (const t of tests) {
      try {
        const res = await httpRequest(t.method, t.url, t.headers, t.body, 15000)
        if (res.status === t.expectedStatus) { passed++; lines.push('✅ [通过] ' + t.name) }
        else lines.push('❌ [失败] ' + t.name + '（期望 ' + t.expectedStatus + '，实际 ' + res.status + '）')
        recordHistory(t.name, res.status === t.expectedStatus ? 'pass' : 'fail', res.durationMs)
      } catch (err) {
        lines.push('❌ [错误] ' + t.name + '：' + (err instanceof Error ? err.message : 'timeout'))
        recordHistory(t.name, 'error', 0)
      }
    }
    lines.push('', '📊 结果：' + passed + '/' + tests.length + ' 通过')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add') {
    return { type: 'text', value: '💡 要添加测试，请在 ' + API_TESTS_DIR + ' 中创建 JSON 文件：\n{\n  "id": "test-1",\n  "name": "获取用户",\n  "method": "GET",\n  "url": "https://api.example.com/users",\n  "headers": {"Authorization": "Bearer token"},\n  "body": "",\n  "expectedStatus": 200,\n  "tags": ["users"]\n}' }
  }

  if (cmd === 'list') {
    const tests = loadTests()
    if (tests.length === 0) return { type: 'text', value: 'ℹ️ 暂无已保存测试' }
    const lines = ['📋 已保存的 API 测试：', '==================', '']
    tests.forEach(t => lines.push(t.method + ' ' + t.url + ' -> ' + t.expectedStatus + '（' + t.name + '）'))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'delete') {
    const name = parts.slice(1).join(' ')
    const tests = loadTests()
    const test = tests.find(t => t.name.toLowerCase().includes(name.toLowerCase()))
    if (!test) return { type: 'text', value: '❌ 未找到：' + name }
    try { require('fs').unlinkSync(join(API_TESTS_DIR, test.id + '.json')); return { type: 'text', value: '✅ 已删除：' + test.name } }
    catch { return { type: 'text', value: '❌ 删除失败' } }
  }

  if (cmd === 'quick') {
    const url = parts[1]
    if (!url) return { type: 'text', value: '📖 用法：/api-test quick <url>' }
    try {
      const res = await httpRequestResolved('GET', url)
      return { type: 'text', value: formatResponse(res) }
    } catch (err) {
      return { type: 'text', value: '❌ 错误：' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'post') {
    const url = parts[1]; const body = parts.slice(2).join(' ')
    if (!url) return { type: 'text', value: '📖 用法：/api-test post <url> <body>' }
    try {
      const res = await httpRequest('POST', url, {}, body)
      return { type: 'text', value: formatResponse(res) }
    } catch (err) {
      return { type: 'text', value: '❌ 错误：' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'history') {
    const historyFile = join(API_TESTS_DIR, 'history.json')
    if (!existsSync(historyFile)) return { type: 'text', value: 'ℹ️ 暂无测试历史。请先运行测试。' }
    try {
      const history = JSON.parse(readFileSync(historyFile, 'utf-8')) as Array<{ name: string; status: string; duration: number; timestamp: string }>
      const lines = ['📅 测试历史：', '==================', '']
      history.slice(-20).reverse().forEach((h: any) => lines.push(`[${h.status}] ${h.name}（${h.duration}ms）- ${h.timestamp}`))
      return { type: 'text', value: lines.join('\n') }
    } catch { return { type: 'text', value: '❌ 读取历史文件出错' } }
  }

  if (cmd === 'export') {
    const tests = loadTests()
    if (tests.length === 0) return { type: 'text', value: 'ℹ️ 没有可导出的测试。' }
    const exportPath = join(process.cwd(), 'api-tests-export.json')
    writeFileSync(exportPath, JSON.stringify(tests, null, 2), 'utf-8')
    return { type: 'text', value: '✅ 已将 ' + tests.length + ' 个测试导出到 ' + exportPath }
  }

  if (cmd === 'collection') {
    const file = parts[1]
    if (!file || !existsSync(file)) return { type: 'text', value: '❌ 未找到文件：' + file }
    try {
      const content = readFileSync(file, 'utf-8')
      const collection = JSON.parse(content)
      const items = collection?.item || collection?.requests || collection?.items || (Array.isArray(collection) ? collection : [collection])
      if (!Array.isArray(items)) return { type: 'text', value: '❌ 无法从 ' + file + ' 解析集合格式' }
      let imported = 0
      items.forEach((item: any) => {
        const req = item.request || item
        const test: APITest = {
          id: 'test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name: item.name || req.method || '未命名',
          method: (req.method || 'GET').toUpperCase(),
          url: req.url?.raw || req.url || '',
          headers: (req.header || []).reduce((acc: any, h: any) => { acc[h.key || h.name] = h.value; return acc }, {}),
          body: item.body || '',
          expectedStatus: 200,
          tags: []
        }
        if (test.url) { saveTest(test); imported++ }
      })
      return { type: 'text', value: '✅ 已从 ' + file + ' 导入 ' + imported + ' 个测试' }
    } catch { return { type: 'text', value: '❌ 解析集合文件出错：' + file } }
  }

  if (cmd === 'compare') {
    const a = parts[1]; const b = parts[2]
    if (!a || !b) return { type: 'text', value: '📖 用法：/api-test compare <name1> <name2>' }
    const tests = loadTests()
    const testA = tests.find(t => t.name.toLowerCase().includes(a.toLowerCase()))
    const testB = tests.find(t => t.name.toLowerCase().includes(b.toLowerCase()))
    if (!testA) return { type: 'text', value: '❌ 未找到测试：' + a }
    if (!testB) return { type: 'text', value: '❌ 未找到测试：' + b }
    try {
      const [resA, resB] = await Promise.all([
        httpRequest(testA.method, testA.url, testA.headers, testA.body),
        httpRequest(testB.method, testB.url, testB.headers, testB.body),
      ])
      const lines = ['🔍 对比：' + testA.name + ' vs ' + testB.name, '', '']
      lines.push('🧪 测试 A：' + testA.name + ' -> ' + resA.status + '（' + resA.durationMs + 'ms）')
      lines.push('🧪 测试 B：' + testB.name + ' -> ' + resB.status + '（' + resB.durationMs + 'ms）')
      lines.push('')
      lines.push(resA.status === resB.status ? '✅ 状态码相同' : '❌ 状态码不同')
      if (resA.body === resB.body) lines.push('✅ 响应体完全一致')
      else lines.push('⚠️ 响应体不同')
      return { type: 'text', value: lines.join('\n') }
    } catch (err) {
      return { type: 'text', value: '❌ 错误：' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'status') {
    const url = parts[1]
    if (!url) return { type: 'text', value: '📖 用法：/api-test status <url>' }
    try {
      const res = await httpRequest('GET', url, {}, undefined, 10000)
      return { type: 'text', value: 'ℹ️ 状态：' + res.status + '（' + res.durationMs + 'ms）' + (res.ok ? ' ✅' : ' ❌') }
    } catch (err) {
      return { type: 'text', value: '❌ 无法访问端点：' + (err instanceof Error ? err.message : 'timeout') }
    }
  }

  if (cmd === 'bench') {
    const url = parts[1]; const n = parseInt(parts[2]) || 10
    if (!url) return { type: 'text', value: '📖 用法：/api-test bench <url> [count]' }
    const lines = ['📈 正在基准测试 ' + url + '（' + n + ' 次请求）：', '']
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
    if (valid.length === 0) return { type: 'text', value: '❌ 所有请求均失败' }
    const avg = Math.round(valid.reduce((s, t) => s + t, 0) / valid.length)
    const min = Math.min(...valid)
    const max = Math.max(...valid)
    lines.push('📊 平均：' + avg + 'ms')
    lines.push('📊 最小：' + min + 'ms')
    lines.push('📊 最大：' + max + 'ms')
    lines.push('📊 成功：' + success + '/' + n)
    lines.push('📊 每秒请求数：' + (success / (avg / 1000)).toFixed(1))
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const apiTest: Command = {
  type: 'local', name: 'api-test',
  description: 'API 测试 - 运行/批量运行/添加/列表/快速请求/历史/导出/集合导入/对比/状态/基准测试',
  aliases: '/api-test, /api, /curl, /test'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default apiTest
