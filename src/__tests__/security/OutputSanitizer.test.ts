import { describe, it, expect } from 'vitest'
import { OutputSanitizer } from '../../security/OutputSanitizer'

describe('OutputSanitizer', () => {
  const sanitizer = new OutputSanitizer()

  describe('sanitize', () => {
    it('truncates output exceeding maxOutputLength', () => {
      const longOutput = 'a'.repeat(100_001)
      const result = sanitizer.sanitize(longOutput)
      expect(result).toContain('[output truncated]')
    })

    it('does not truncate output within limit', () => {
      const shortOutput = 'hello world'
      const result = sanitizer.sanitize(shortOutput)
      expect(result).not.toContain('[output truncated]')
      expect(result).toBe('hello world')
    })

    it('redacts secrets with key=value format', () => {
      const input = 'api_key = sk-abcdefghijklmnopqrstuvwx'
      const result = sanitizer.sanitize(input)
      expect(result).toContain('***REDACTED***')
    })

    it('redacts Bearer tokens', () => {
      const input = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz.1234567890'
      const result = sanitizer.sanitize(input)
      expect(result).toContain('Bearer ***REDACTED***')
    })

    it('redacts passwords', () => {
      const input = 'password = mySecretPass123'
      const result = sanitizer.sanitize(input)
      expect(result).toContain('***REDACTED***')
    })

    it('redacts AWS access keys', () => {
      const input = 'AKIAIOSFODNN7EXAMPLE'
      const result = sanitizer.sanitize(input)
      expect(result).toContain('***AWS_KEY_REDACTED***')
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE')
    })

    it('redacts private keys', () => {
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRE...\n-----END RSA PRIVATE KEY-----'
      const result = sanitizer.sanitize(input)
      expect(result).toContain('***PRIVATE_KEY_REDACTED***')
      expect(result).not.toContain('BEGIN RSA PRIVATE KEY')
    })

    it('redacts IP addresses when enabled', () => {
      const input = 'Connected to 192.168.1.1:8080'
      const result = sanitizer.sanitize(input, { redactIPs: true })
      expect(result).toContain('***IP_REDACTED***')
      expect(result).not.toContain('192.168.1.1')
    })

    it('does not redact IPs by default', () => {
      const input = 'Server at 10.0.0.1'
      const result = sanitizer.sanitize(input)
      expect(result).toContain('10.0.0.1')
    })

    it('redacts emails when enabled', () => {
      const input = 'Contact: user@example.com'
      const result = sanitizer.sanitize(input, { redactEmails: true })
      expect(result).toContain('***EMAIL_REDACTED***')
      expect(result).not.toContain('user@example.com')
    })

    it('redacts paths when enabled', () => {
      const input = 'File at C:\\Users\\john\\docs\\file.txt'
      const result = sanitizer.sanitize(input, { redactPaths: true })
      expect(result).toContain('***PATH_REDACTED***')
    })

    it('redacts credit card numbers', () => {
      const input = 'Card: 4111 1111 1111 1111'
      const result = sanitizer.sanitize(input)
      expect(result).toContain('***CARD_REDACTED***')
      expect(result).not.toContain('4111')
    })
  })
})
