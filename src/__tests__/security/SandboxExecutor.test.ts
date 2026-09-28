import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SandboxExecutor } from '../../security/SandboxExecutor'

describe('SandboxExecutor', () => {
  describe('getConfig / updateConfig', () => {
    it('returns default config', () => {
      const executor = new SandboxExecutor()
      const config = executor.getConfig()
      expect(config.enabled).toBe(true)
      expect(config.timeout).toBe(60000)
      expect(config.maxMemory).toBe(512)
      expect(config.networkAccess).toBe(false)
    })

    it('merges custom config', () => {
      const executor = new SandboxExecutor({
        timeout: 30000,
        maxMemory: 256,
        networkAccess: true,
      })
      const config = executor.getConfig()
      expect(config.timeout).toBe(30000)
      expect(config.maxMemory).toBe(256)
      expect(config.networkAccess).toBe(true)
      // defaults preserved
      expect(config.enabled).toBe(true)
    })

    it('updates config after creation', () => {
      const executor = new SandboxExecutor()
      executor.updateConfig({ timeout: 120000 })
      expect(executor.getConfig().timeout).toBe(120000)
    })
  })

  describe('isPathAllowed', () => {
    it('allows paths not in blocked list', () => {
      const executor = new SandboxExecutor({
        blockedPaths: ['/etc', '/var'],
      })
      expect(executor.isPathAllowed('/home/user/file.txt')).toBe(true)
    })

    it('blocks paths in blocked list', () => {
      const executor = new SandboxExecutor({
        blockedPaths: ['/etc', '/var'],
      })
      expect(executor.isPathAllowed('/etc/passwd')).toBe(false)
      expect(executor.isPathAllowed('/var/log/syslog')).toBe(false)
    })

    it('respects allowedPaths whitelist', () => {
      const executor = new SandboxExecutor({
        allowedPaths: ['/home/user/project'],
        blockedPaths: [],
      })
      expect(executor.isPathAllowed('/home/user/project/src/index.ts')).toBe(true)
      expect(executor.isPathAllowed('/home/user/other/file.txt')).toBe(false)
    })

    it('allows any path when allowedPaths is empty', () => {
      const executor = new SandboxExecutor({
        allowedPaths: [],
        blockedPaths: [],
      })
      expect(executor.isPathAllowed('/any/path')).toBe(true)
    })
  })

  describe('execute (disabled sandbox)', () => {
    it('falls back to direct execution when disabled', async () => {
      const executor = new SandboxExecutor({ enabled: false })
      const result = await executor.execute('node', ['-e', 'console.log("hello")'])
      expect(result.stdout.trim()).toBe('hello')
      expect(result.timedOut).toBe(false)
    })
  })
})
