import { describe, it, expect, afterEach } from 'vitest'
import {
  validateJsonSchema,
  evaluateAssertion,
  resolveEnvVars,
  formatResponse,
} from '../../commands/api-test/index.ts'

describe('api-test validateJsonSchema', () => {
  it('应该验证基础类型', () => {
    expect(validateJsonSchema(42, { type: 'number' })).toBeNull()
    expect(validateJsonSchema(42, { type: 'string' })).toContain('expected string')
    expect(validateJsonSchema('hi', { type: 'string' })).toBeNull()
    expect(validateJsonSchema(true, { type: 'boolean' })).toBeNull()
    expect(validateJsonSchema([1, 2], { type: 'array' })).toBeNull()
    expect(validateJsonSchema({ a: 1 }, { type: 'object' })).toBeNull()
  })

  it('应该验证 integer 类型（整数 vs 浮点）', () => {
    expect(validateJsonSchema(3, { type: 'integer' })).toBeNull()
    expect(validateJsonSchema(3.5, { type: 'integer' })).toContain('expected integer')
  })

  it('应该验证 null 类型', () => {
    expect(validateJsonSchema(null, { type: 'null' })).toBeNull()
    expect(validateJsonSchema(0, { type: 'null' })).toContain('expected null')
  })

  it('应该验证必填属性', () => {
    const schema = { type: 'object', required: ['id', 'name'], properties: {} }
    expect(validateJsonSchema({ id: 1, name: 'x' }, schema)).toBeNull()
    expect(validateJsonSchema({ id: 1 }, schema)).toContain('missing required property: name')
  })

  it('应该递归验证属性', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        meta: {
          type: 'object',
          properties: {
            count: { type: 'integer' },
          },
        },
      },
    }
    expect(validateJsonSchema({ id: 1, name: 'x', meta: { count: 5 } }, schema)).toBeNull()
    expect(validateJsonSchema({ id: 1, name: 'x', meta: { count: 5.5 } }, schema)).toContain('meta: count: expected integer')
    expect(validateJsonSchema({ id: 'bad', name: 'x' }, schema)).toContain('id: expected number')
  })

  it('应该验证数组项', () => {
    const schema = { type: 'array', items: { type: 'string' } }
    expect(validateJsonSchema(['a', 'b'], schema)).toBeNull()
    expect(validateJsonSchema(['a', 5], schema)).toContain('[1]: expected string')
  })

  it('无 schema 时返回 null', () => {
    expect(validateJsonSchema({ anything: true }, {})).toBeNull()
    expect(validateJsonSchema('x', {})).toBeNull()
  })
})

describe('api-test evaluateAssertion', () => {
  const res = {
    status: 200,
    body: '{"ok":true,"message":"hello world"}',
    headers: {},
    durationMs: 10,
    ok: true,
  }

  it('应该支持 status 比较运算', () => {
    expect(evaluateAssertion('status == 200', res)).toBe(true)
    expect(evaluateAssertion('status == 201', res)).toBe(false)
    expect(evaluateAssertion('status != 404', res)).toBe(true)
    expect(evaluateAssertion('status >= 200', res)).toBe(true)
    expect(evaluateAssertion('status < 200', res)).toBe(false)
    expect(evaluateAssertion('status > 199', res)).toBe(true)
    expect(evaluateAssertion('status <= 200', res)).toBe(true)
  })

  it('应该支持 body contains', () => {
    expect(evaluateAssertion('body contains "hello world"', res)).toBe(true)
    expect(evaluateAssertion('body contains "nonexistent"', res)).toBe(false)
    expect(evaluateAssertion("body contains 'ok'", res)).toBe(true)
  })

  it('应该支持 body ~ 正则', () => {
    expect(evaluateAssertion('body ~ "hello"', res)).toBe(true)
    expect(evaluateAssertion('body ~ "world"', res)).toBe(true)
    expect(evaluateAssertion('body ~ "xyz"', res)).toBe(false)
    expect(evaluateAssertion('body ~ "hello \\\\w+"', res)).toBe(false)
    expect(evaluateAssertion('body ~ "hello"', res)).toBe(true)
  })

  it('未知断言默认通过', () => {
    expect(evaluateAssertion('something weird', res)).toBe(true)
  })
})

describe('api-test resolveEnvVars', () => {
  it('应该替换环境变量占位符', () => {
    process.env.TEST_API_KEY = 'secret123'
    expect(resolveEnvVars('https://api.example.com/${TEST_API_KEY}')).toBe('https://api.example.com/secret123')
  })

  it('未定义的环境变量保持原样', () => {
    expect(resolveEnvVars('${UNDEFINED_VAR_XYZ}')).toBe('${UNDEFINED_VAR_XYZ}')
  })

  it('无占位符时原样返回', () => {
    expect(resolveEnvVars('plain string')).toBe('plain string')
  })

  it('小写/非法的变量名不替换', () => {
    expect(resolveEnvVars('${lowercase}')).toBe('${lowercase}')
  })

  afterEach(() => {
    delete process.env.TEST_API_KEY
  })
})

describe('api-test formatResponse', () => {
  it('应该格式化状态、时长与正文', () => {
    const out = formatResponse({ status: 200, body: '{"ok":true}', headers: {}, durationMs: 15, ok: true })
    expect(out).toContain('Status: 200 ✅')
    expect(out).toContain('Duration: 15ms')
    expect(out).toContain('{"ok":true}')
  })

  it('应该截断超长正文并标注字节数', () => {
    const body = 'x'.repeat(3000)
    const out = formatResponse({ status: 500, body, headers: {}, durationMs: 5, ok: false }, 100)
    expect(out).toContain('Status: 500 ❌')
    expect(out).toContain('... (3000 bytes total)')
  })
})
