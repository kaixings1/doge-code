/**
 * MemoryManager 行为测试。用注入的 heapUsedProvider 控制水位，
 * 不依赖真实内存压力，避免 flaky。
 */
import { describe, it, expect } from 'vitest'
import { MemoryManager } from '../MemoryManager.js'

const MB = 1024 * 1024

describe('MemoryManager', () => {
  it('水位分级：ok / high / critical', () => {
    let used = 100
    const m = new MemoryManager({
      highWaterMark: 200,
      criticalWaterMark: 400,
      heapUsedProvider: () => used * MB,
    })
    expect(m.getStatus().level).toBe('ok')
    used = 250
    expect(m.getStatus().level).toBe('high')
    used = 500
    expect(m.getStatus().level).toBe('critical')
  })

  it('criticalWaterMark 缺省时按 highWaterMark 的 1.5 倍推导', () => {
    const m = new MemoryManager({
      highWaterMark: 200,
      heapUsedProvider: () => 0,
    })
    expect(m.getStatus().criticalWaterMark).toBe(300)
  })

  it('waitForMemory 在高压时等待、回落后放行', async () => {
    let used = 500 // 高于 highWaterMark
    const m = new MemoryManager({
      highWaterMark: 200,
      pollIntervalMs: 10,
      heapUsedProvider: () => used * MB,
    })
    // 50ms 后回落
    setTimeout(() => {
      used = 100
    }, 50)
    const r = await m.waitForMemory()
    expect(r).toBe('ok')
  })

  it('waitForMemory 超时放行并返回 timeout（不永久阻塞）', async () => {
    const m = new MemoryManager({
      highWaterMark: 200,
      pollIntervalMs: 10,
      maxWaitMs: 60,
      heapUsedProvider: () => 999 * MB, // 始终高压
    })
    const r = await m.waitForMemory()
    expect(r).toBe('timeout')
  })

  it('tryGC 无 --expose-gc 时安全返回 false', () => {
    const m = new MemoryManager()
    const hadGc = typeof (globalThis as { gc?: unknown }).gc === 'function'
    const r = m.tryGC()
    // 环境未暴露 gc 时必须返回 false 且不抛错
    expect(r).toBe(hadGc)
  })
})
