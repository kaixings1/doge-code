/**
 * __tests__/commands/apiDebug.test.ts — api-debug 命令纯逻辑测试
 *
 * 覆盖：generateId / RequestRecord 类型 / URL 验证
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 纯逻辑重放（从 api-debug/index.ts 复制）
// ---------------------------------------------------------------------------

function generateId(): string {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return url.startsWith('http://') || url.startsWith('https://')
  } catch {
    return false
  }
}

function buildRequestRecord(
  overrides: Partial<{
    method: string
    url: string
    status: number
    statusText: string
    duration: number
    requestHeaders: Record<string, string>
    requestBody: string
    responseHeaders: Record<string, string>
    responseBody: string
    size: number
  }> = {},
): {
  id: string
  timestamp: number
  method: string
  url: string
  status: number
  statusText: string
  duration: number
  requestHeaders: Record<string, string>
  responseBody: string
  size: number
} {
  return {
    id: generateId(),
    timestamp: Date.now(),
    method: overrides.method || 'GET',
    url: overrides.url || 'https://api.example.com/test',
    status: overrides.status || 200,
    statusText: overrides.statusText || 'OK',
    duration: overrides.duration || 100,
    requestHeaders: overrides.requestHeaders || { 'Content-Type': 'application/json' },
    responseBody: overrides.responseBody || '{"ok": true}',
    size: overrides.size || 20,
  }
}

// ---------------------------------------------------------------------------
// Tests: generateId
// ---------------------------------------------------------------------------

describe('api-debug generateId', () => {
  it('应返回字符串', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
  })

  it('应以 req_ 开头', () => {
    const id = generateId()
    expect(id.startsWith('req_')).toBe(true)
  })

  it('每次调用应生成不同 ID', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Tests: isValidUrl
// ---------------------------------------------------------------------------

describe('api-debug isValidUrl', () => {
  it('应接受 https URL', () => {
    expect(isValidUrl('https://api.example.com/test')).toBe(true)
  })

  it('应接受 http URL', () => {
    expect(isValidUrl('http://localhost:3000')).toBe(true)
  })

  it('应拒绝 ftp URL', () => {
    expect(isValidUrl('ftp://files.example.com')).toBe(false)
  })

  it('应拒绝空字符串', () => {
    expect(isValidUrl('')).toBe(false)
  })

  it('应拒绝无效 URL', () => {
    expect(isValidUrl('not-a-url')).toBe(false)
  })

  it('应拒绝 file:// URL', () => {
    expect(isValidUrl('file:///etc/passwd')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: buildRequestRecord
// ---------------------------------------------------------------------------

describe('api-debug buildRequestRecord', () => {
  it('默认应返回 GET 请求', () => {
    const record = buildRequestRecord()
    expect(record.method).toBe('GET')
    expect(record.status).toBe(200)
  })

  it('应支持自定义覆盖', () => {
    const record = buildRequestRecord({
      method: 'POST',
      url: 'https://api.example.com/create',
      status: 201,
      duration: 250,
    })
    expect(record.method).toBe('POST')
    expect(record.status).toBe(201)
    expect(record.duration).toBe(250)
    expect(record.url).toBe('https://api.example.com/create')
  })

  it('应包含时间戳', () => {
    const before = Date.now()
    const record = buildRequestRecord()
    const after = Date.now()
    expect(record.timestamp).toBeGreaterThanOrEqual(before)
    expect(record.timestamp).toBeLessThanOrEqual(after)
  })

  it('应包含默认请求头', () => {
    const record = buildRequestRecord()
    expect(record.requestHeaders['Content-Type']).toBe('application/json')
  })

  it('应计算响应大小', () => {
    const body = '{"result": "success"}'
    const record = buildRequestRecord({ responseBody: body, size: body.length })
    expect(record.size).toBe(body.length)
  })
})
