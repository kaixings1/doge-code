import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { daemonMain } from '../../daemon/main'

describe('daemonMain', () => {
  describe('unknown command', () => {
    it('prints usage for unknown command', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await daemonMain(['unknown'])
      expect(logSpy).toHaveBeenCalledWith('用法: claude daemon <start|stop|status>')
      logSpy.mockRestore()
    })
  })

  describe('status', () => {
    it('does not throw', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await expect(daemonMain(['status'])).resolves.toBeUndefined()
      expect(logSpy.mock.calls.length).toBeGreaterThan(0)
      logSpy.mockRestore()
    })
  })

  describe('stop', () => {
    it('does not throw', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await expect(daemonMain(['stop'])).resolves.toBeUndefined()
      expect(logSpy.mock.calls.length).toBeGreaterThan(0)
      logSpy.mockRestore()
    })
  })

  describe('start', () => {
    it('does not throw when starting', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await expect(daemonMain(['start'])).resolves.toBeUndefined()
      expect(logSpy.mock.calls.length).toBeGreaterThan(0)
      logSpy.mockRestore()
    })
  })
})
