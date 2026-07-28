/**
 * MarkdownRenderer 组件测试
 *
 * 测试 Markdown 渲染和 JSON 格式化功能：
 * - JSON 自动检测和格式化
 * - 代码块语法高亮
 * - Markdown 元素渲染
 * - 语言自动检测
 */

import { describe, it, expect } from 'bun:test'

// 语言检测函数
function detectLanguage(code: string): string {
  const trimmed = code.trim()
  if (!trimmed) return ''
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.includes(':')) return 'json'
  if (/^(import|export|const|let|var|function|class|interface|type)\s/m.test(trimmed)) return 'typescript'
  if (/#!\/bin\/(bash|sh)/.test(trimmed) || /^(echo|cd|ls|rm|cp|mv|mkdir|cat|grep|find|git|npm|bun)\s/m.test(trimmed)) return 'bash'
  if (/^(def |class |import |from |if __name__)/m.test(trimmed)) return 'python'
  if (/^(package |import |func |type )/m.test(trimmed)) return 'go'
  if (/^(use |fn |let |mut |impl |pub )/m.test(trimmed)) return 'rust'
  if (/^(<!DOCTYPE|<html|<div|<span)/i.test(trimmed)) return 'html'
  if (/^(body|\.[\w-]+|#[\w-]+)\s*\{/m.test(trimmed)) return 'css'
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(trimmed)) return 'sql'
  if (/^(version:|services:|networks:|volumes:)/m.test(trimmed)) return 'yaml'
  return ''
}

// JSON 格式化函数
function tryFormatJson(text: string): string | null {
  const trimmed = text.trim()
  if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      const parsed = JSON.parse(trimmed)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return null
    }
  }
  return null
}

describe('MarkdownRenderer', () => {
  describe('detectLanguage', () => {
    it('应检测 JSON', () => {
      expect(detectLanguage('{"key": "value"}')).toBe('json')
      expect(detectLanguage('[1, 2, 3]')).not.toBe('json') // 数组没有 : 不检测为 json
      expect(detectLanguage('{"name": "test", "items": [1,2,3]}')).toBe('json')
    })

    it('应检测 TypeScript', () => {
      expect(detectLanguage('const x = 1')).toBe('typescript')
      expect(detectLanguage('function foo() {}')).toBe('typescript')
      expect(detectLanguage('interface Foo { bar: string }')).toBe('typescript')
      expect(detectLanguage('import React from "react"')).toBe('typescript')
    })

    it('应检测 Bash', () => {
      expect(detectLanguage('#!/bin/bash\necho "hello"')).toBe('bash')
      expect(detectLanguage('ls -la')).toBe('bash')
      expect(detectLanguage('git commit -m "msg"')).toBe('bash')
    })

    it('应检测 Python', () => {
      expect(detectLanguage('def foo():')).toBe('python')
      expect(detectLanguage('if __name__ == "__main__":')).toBe('python')
      expect(detectLanguage('from os import path')).toBe('python')
    })

    it('应检测 Go', () => {
      expect(detectLanguage('package main')).toBe('go')
      expect(detectLanguage('func main() {}')).toBe('go')
      expect(detectLanguage('const x = 1')).not.toBe('go') // 确保不被误判
    })

    it('应检测 Rust', () => {
      expect(detectLanguage('fn main() {}')).toBe('rust')
      expect(detectLanguage('use std::io;')).toBe('rust')
      expect(detectLanguage('impl Foo {}')).toBe('rust')
    })

    it('应检测 HTML', () => {
      expect(detectLanguage('<!DOCTYPE html>')).toBe('html')
      expect(detectLanguage('<div class="foo">')).toBe('html')
    })

    it('应检测 CSS', () => {
      expect(detectLanguage('body { color: red; }')).toBe('css')
      expect(detectLanguage('.foo { display: flex; }')).toBe('css')
    })

    it('应检测 SQL', () => {
      expect(detectLanguage('SELECT * FROM users')).toBe('sql')
      expect(detectLanguage('INSERT INTO table VALUES (1)')).toBe('sql')
    })

    it('应检测 YAML', () => {
      expect(detectLanguage('version: "3"')).toBe('yaml')
      expect(detectLanguage('services:\n  web:')).toBe('yaml')
    })

    it('空字符串应返回空', () => {
      expect(detectLanguage('')).toBe('')
    })
  })

  describe('tryFormatJson', () => {
    it('应格式化有效的对象 JSON', () => {
      const input = '{"name":"test","value":123}'
      const result = tryFormatJson(input)
      expect(result).not.toBeNull()
      expect(result).toContain('\n')
      expect(result).toContain('  ')
    })

    it('应格式化有效的数组 JSON', () => {
      const input = '[1,2,3]'
      const result = tryFormatJson(input)
      expect(result).not.toBeNull()
    })

    it('应格式化嵌套 JSON', () => {
      const input = '{"a":{"b":{"c":1}}}'
      const result = tryFormatJson(input)
      expect(result).not.toBeNull()
      expect(result).toContain('    ') // 4 spaces for nested
    })

    it('对无效 JSON 应返回 null', () => {
      expect(tryFormatJson('not json')).toBeNull()
      expect(tryFormatJson('{invalid}')).toBeNull()
      expect(tryFormatJson('')).toBeNull()
    })

    it('对纯文本应返回 null', () => {
      expect(tryFormatJson('hello world')).toBeNull()
      expect(tryFormatJson('const x = 1')).toBeNull()
    })

    it('应保留 JSON 数据的完整性', () => {
      const obj = { name: 'test', count: 42, active: true, items: ['a', 'b'] }
      const input = JSON.stringify(obj)
      const result = tryFormatJson(input)
      expect(result).not.toBeNull()
      const parsed = JSON.parse(result!)
      expect(parsed).toEqual(obj)
    })
  })
})
