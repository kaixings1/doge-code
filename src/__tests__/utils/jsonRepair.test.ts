import { describe, it, expect } from 'vitest'
import {
  parseJsonStream,
  safeJsonStringify,
  maskSecret,
} from '../../utils/jsonRepair.js'

describe('parseJsonStream', () => {
  it('passes through valid JSON', () => {
    expect(parseJsonStream('{"a":1}')).toEqual({ a: 1 })
  })

  it('passes through valid JSON array', () => {
    expect(parseJsonStream('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('returns original string for non-JSON input', () => {
    expect(parseJsonStream('hello')).toBe('hello')
  })

  it('returns original string for empty input', () => {
    expect(parseJsonStream('')).toBe('')
  })

  it('passes through non-string input', () => {
    expect(parseJsonStream(42)).toBe(42)
    expect(parseJsonStream(null)).toBe(null)
  })

  it('repairs bare object with unquoted string value', () => {
    // LLM output: {"key": someValue}
    const result = parseJsonStream('{"name": hello}')
    expect(result).toEqual({ name: 'hello' })
  })

  it('does not repair values that are already valid JSON tokens', () => {
    // Already valid JSON — should parse normally
    expect(parseJsonStream('{"a": true}')).toEqual({ a: true })
    expect(parseJsonStream('{"a": null}')).toEqual({ a: null })
    expect(parseJsonStream('{"a": 42}')).toEqual({ a: 42 })
  })
})

describe('safeJsonStringify', () => {
  it('stringifies simple objects', () => {
    expect(safeJsonStringify({ a: 1, b: 'hello' })).toBe('{"a":1,"b":"hello"}')
  })

  it('handles bigint', () => {
    expect(safeJsonStringify({ n: 9007199254740991n })).toBe(
      '{"n":"9007199254740991"}',
    )
  })

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj
    expect(safeJsonStringify(obj)).toBe('{"a":1,"self":"[Circular]"}')
  })

  it('returns "null" for nullish input', () => {
    expect(safeJsonStringify(null)).toBe('null')
    expect(safeJsonStringify(undefined)).toBe('null')
  })

  it('returns null for functions', () => {
    expect(safeJsonStringify(() => {})).toBe('null')
  })
})

describe('maskSecret', () => {
  it('masks short secrets', () => {
    expect(maskSecret('abc')).toBe('****')
    expect(maskSecret('12345678')).toBe('****')
  })

  it('masks long secrets', () => {
    expect(maskSecret('sk-ant-abc123xyz')).toBe('sk-a...3xyz')
    expect(maskSecret('abcdefghijklmnop')).toBe('abcd...mnop')
  })

  it('handles edge case exactly 8 chars', () => {
    expect(maskSecret('12345678')).toBe('****')
  })

  it('handles 9 chars', () => {
    expect(maskSecret('123456789')).toBe('1234...6789')
  })
})
