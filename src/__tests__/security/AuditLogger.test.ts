import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuditLogger } from '../../security/AuditLogger'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('AuditLogger', () => {
  let logFile: string
  let logger: AuditLogger

  beforeEach(async () => {
    logFile = join(tmpdir(), `audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.log`)
    const logDir = logFile.substring(0, logFile.lastIndexOf('\\'))
    try { await fs.mkdir(logDir, { recursive: true }) } catch { /* ignore */ }
    logger = new AuditLogger(logFile)
  })

  afterEach(async () => {
    await logger.stop()
    vi.restoreAllMocks()
    try { await fs.unlink(logFile) } catch { /* ignore */ }
  })

  describe('log', () => {
    it('records an audit entry', async () => {
      logger.log({
        level: 'info',
        category: 'test',
        action: 'test-action',
        details: { key: 'value' },
        result: 'success',
      })

      await logger.flush()
      const content = await fs.readFile(logFile, 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).toHaveLength(1)
      const entry = JSON.parse(lines[0])
      expect(entry.category).toBe('test')
      expect(entry.action).toBe('test-action')
      expect(entry.result).toBe('success')
      expect(entry.id).toBeDefined()
      expect(entry.timestamp).toBeDefined()
    })

    it('generates unique IDs', async () => {
      logger.log({ level: 'info', category: 'c', action: 'a', details: {}, result: 'success' })
      logger.log({ level: 'info', category: 'c', action: 'a', details: {}, result: 'success' })
      await logger.flush()
      const content = await fs.readFile(logFile, 'utf-8')
      const lines = content.trim().split('\n')
      const ids = lines.map(l => JSON.parse(l).id)
      expect(new Set(ids).size).toBe(2)
    })
  })

  describe('logToolCall', () => {
    it('logs tool call with sanitized params', async () => {
      logger.logToolCall({
        tool: 'FileReadTool',
        action: 'read',
        params: { path: '/home/user/file.txt', password: 'secret' },
        result: 'success',
      })
      await logger.flush()
      const content = await fs.readFile(logFile, 'utf-8')
      const entry = JSON.parse(content.trim())
      expect(entry.category).toBe('tool_call')
      expect(entry.tool).toBe('FileReadTool')
      expect(entry.details.params.password).toBe('***REDACTED***')
    })
  })

  describe('logSecurityEvent', () => {
    it('logs security event and retrieves via query', async () => {
      logger.logSecurityEvent({
        event: 'path_traversal',
        severity: 'critical',
        details: { path: '../../etc/passwd' },
      })
      await logger.flush()
      const entries = await logger.query({ level: 'critical' })
      expect(entries.some(e => e.action === 'path_traversal')).toBe(true)
    })
  })

  describe('logPermissionChange', () => {
    it('logs permission change', async () => {
      logger.logPermissionChange({
        action: 'grant',
        tool: 'WriteTool',
        decision: 'allow',
      })
      await logger.flush()
      const content = await fs.readFile(logFile, 'utf-8')
      const entry = JSON.parse(content.trim())
      expect(entry.category).toBe('permission')
      expect(entry.details.decision).toBe('allow')
    })
  })

  describe('query', () => {
    it('queries entries by level', async () => {
      logger.log({ level: 'info', category: 'c1', action: 'a', details: {}, result: 'success' })
      logger.log({ level: 'error', category: 'c2', action: 'b', details: {}, result: 'failure' })
      logger.log({ level: 'info', category: 'c3', action: 'c', details: {}, result: 'success' })
      await logger.flush()

      const errors = await logger.query({ level: 'error' })
      expect(errors).toHaveLength(1)
      expect(errors[0].action).toBe('b')
    })

    it('queries entries by category', async () => {
      logger.log({ level: 'info', category: 'tool_call', action: 'read', details: {}, result: 'success' })
      logger.log({ level: 'info', category: 'security', action: 'block', details: {}, result: 'denied' })
      await logger.flush()

      const toolCalls = await logger.query({ category: 'tool_call' })
      expect(toolCalls).toHaveLength(1)
    })

    it('applies limit', async () => {
      for (let i = 0; i < 10; i++) {
        logger.log({ level: 'info', category: 'c', action: `a${i}`, details: {}, result: 'success' })
      }
      await logger.flush()

      const limited = await logger.query({ limit: 3 })
      expect(limited).toHaveLength(3)
    })
  })

  describe('flush', () => {
    it('等待自动刷新完成后才返回', async () => {
      let release!: () => void
      const pendingWrite = new Promise<void>(resolve => { release = resolve })
      const append = vi.spyOn(fs, 'appendFile').mockImplementation(() => pendingWrite)
      logger.log({ level: 'critical', category: 'c', action: 'first', details: {}, result: 'failure' })
      await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(1))
      let completed = false
      const flushed = logger.flush().then(() => { completed = true })
      try {
        await Promise.resolve()
        await Promise.resolve()
        expect(completed).toBe(false)
      } finally {
        release()
        await flushed
      }
    })

    it('写入失败时保留日志供后续重试', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const append = vi.spyOn(fs, 'appendFile').mockRejectedValueOnce(new Error('写入失败')).mockImplementation(async () => {})
      logger.log({ level: 'info', category: 'c', action: 'retry', details: {}, result: 'success' })
      await logger.flush()
      expect(logger['entries']).toHaveLength(1)
      await logger.flush()
      expect(append).toHaveBeenCalledTimes(2)
      expect(logger['entries']).toHaveLength(0)
    })

    it('clears entries after flush', async () => {
      logger.log({ level: 'info', category: 'c', action: 'a', details: {}, result: 'success' })
      await logger.flush()
      // flush后entries应该被清空
      expect(logger['entries']).toHaveLength(0)
    })

    it('flushes to file and empties internal buffer', async () => {
      logger.log({ level: 'info', category: 'c', action: 'a', details: {}, result: 'success' })
      expect(logger['entries']).toHaveLength(1)
      await logger.flush()
      expect(logger['entries']).toHaveLength(0)
      const content = await fs.readFile(logFile, 'utf-8')
      expect(content.trim()).not.toHaveLength(0)
    })
  })
})
