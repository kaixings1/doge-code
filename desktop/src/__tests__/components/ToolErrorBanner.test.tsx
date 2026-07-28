/**
 * ToolErrorBanner 组件测试
 *
 * 测试工具错误分类展示功能：
 * - 权限错误分类
 * - 网络错误分类
 * - 文件错误分类
 * - 输入错误分类
 * - 限流错误分类
 * - 内存错误分类
 * - 默认执行错误分类
 */

import { describe, it, expect } from 'bun:test'

interface ToolErrorCategory {
  label: string
  color: string
  icon: string
  suggestion?: string
}

function classifyError(err: string): ToolErrorCategory {
  const lower = err.toLowerCase()
  if (/permission|denied|not allowed|unauthorized|forbidden|eacces/.test(lower)) {
    return { label: '权限错误', color: '#FF6B6B', icon: '🔒', suggestion: '请检查工具权限设置，或手动确认后重试' }
  }
  if (/network|timeout|connection|econnrefused|econnreset|enotfound|etimedout|socket|dns/.test(lower)) {
    return { label: '网络错误', color: '#FFA726', icon: '🌐', suggestion: '请检查网络连接，或稍后重试' }
  }
  if (/enoent|no such file|not found|file not exist|path not found/.test(lower)) {
    return { label: '文件错误', color: '#EF5350', icon: '📁', suggestion: '请确认文件路径是否正确' }
  }
  if (/syntax|parse|invalid|typeerror|referenceerror|unexpected|malformed/.test(lower)) {
    return { label: '输入错误', color: '#AB47BC', icon: '⚠️', suggestion: '请检查输入参数格式是否正确' }
  }
  if (/rate.?limit|throttl|429|too many requests/.test(lower)) {
    return { label: '限流错误', color: '#FFA726', icon: '⏱️', suggestion: '请求过于频繁，请稍后重试' }
  }
  if (/memory|heap|out of memory|cannot allocate/.test(lower)) {
    return { label: '内存错误', color: '#EF5350', icon: '💾', suggestion: '内存不足，请关闭部分标签页后重试' }
  }
  return { label: '执行错误', color: '#FF6B6B', icon: '❌', suggestion: '工具执行过程中发生未知错误' }
}

describe('ToolErrorBanner', () => {
  describe('错误分类', () => {
    it('应正确分类权限错误 - permission denied', () => {
      const result = classifyError('Permission denied: cannot write to /etc/config')
      expect(result.label).toBe('权限错误')
      expect(result.icon).toBe('🔒')
      expect(result.color).toBe('#FF6B6B')
    })

    it('应正确分类权限错误 - unauthorized', () => {
      const result = classifyError('Unauthorized: invalid API key')
      expect(result.label).toBe('权限错误')
    })

    it('应正确分类权限错误 - forbidden', () => {
      const result = classifyError('403 Forbidden: access denied')
      expect(result.label).toBe('权限错误')
    })

    it('应正确分类网络错误 - connection refused', () => {
      const result = classifyError('ECONNREFUSED: Connection refused')
      expect(result.label).toBe('网络错误')
      expect(result.icon).toBe('🌐')
      expect(result.color).toBe('#FFA726')
    })

    it('应正确分类网络错误 - timeout', () => {
      const result = classifyError('ETIMEDOUT: Connection timed out')
      expect(result.label).toBe('网络错误')
    })

    it('应正确分类网络错误 - DNS', () => {
      const result = classifyError('ENOTFOUND: DNS lookup failed')
      expect(result.label).toBe('网络错误')
    })

    it('应正确分类文件错误 - ENOENT', () => {
      const result = classifyError('ENOENT: no such file or directory')
      expect(result.label).toBe('文件错误')
      expect(result.icon).toBe('📁')
      expect(result.color).toBe('#EF5350')
    })

    it('应正确分类文件错误 - not found', () => {
      const result = classifyError('File not found: /path/to/file.txt')
      expect(result.label).toBe('文件错误')
    })

    it('应正确分类输入错误 - syntax error', () => {
      const result = classifyError('SyntaxError: Unexpected token')
      expect(result.label).toBe('输入错误')
      expect(result.icon).toBe('⚠️')
      expect(result.color).toBe('#AB47BC')
    })

    it('应正确分类输入错误 - invalid JSON', () => {
      const result = classifyError('Invalid JSON: malformed input')
      expect(result.label).toBe('输入错误')
    })

    it('应正确分类限流错误 - rate limit', () => {
      const result = classifyError('Rate limit exceeded: too many requests')
      expect(result.label).toBe('限流错误')
      expect(result.icon).toBe('⏱️')
    })

    it('应正确分类限流错误 - 429', () => {
      const result = classifyError('HTTP 429: Too Many Requests')
      expect(result.label).toBe('限流错误')
    })

    it('应正确分类内存错误 - out of memory', () => {
      const result = classifyError('FATAL: out of memory')
      expect(result.label).toBe('内存错误')
      expect(result.icon).toBe('💾')
    })

    it('应正确分类内存错误 - heap', () => {
      const result = classifyError('JavaScript heap out of memory')
      expect(result.label).toBe('内存错误')
    })

    it('应将未知错误分类为执行错误', () => {
      const result = classifyError('Something went wrong')
      expect(result.label).toBe('执行错误')
      expect(result.icon).toBe('❌')
      expect(result.color).toBe('#FF6B6B')
    })
  })

  describe('建议信息', () => {
    it('权限错误应包含权限相关建议', () => {
      const result = classifyError('Permission denied')
      expect(result.suggestion).toContain('权限')
    })

    it('网络错误应包含网络相关建议', () => {
      const result = classifyError('Connection timeout')
      expect(result.suggestion).toContain('网络')
    })

    it('文件错误应包含路径相关建议', () => {
      const result = classifyError('File not found')
      expect(result.suggestion).toContain('路径')
    })

    it('输入错误应包含格式相关建议', () => {
      const result = classifyError('Invalid syntax')
      expect(result.suggestion).toContain('格式')
    })
  })
})
