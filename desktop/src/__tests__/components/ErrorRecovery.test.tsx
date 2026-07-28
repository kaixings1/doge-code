/**
 * 错误恢复测试
 *
 * 测试应用在各种错误场景下的恢复能力：
 * - 网络中断处理
 * - API 失败重试
 * - 工具执行错误恢复
 * - 错误分类正确性
 * - 错误消息格式化
 */

import { describe, it, expect } from 'bun:test'

// 模拟网络状态
type NetworkStatus = 'online' | 'offline' | 'reconnecting'

class NetworkManager {
  private status: NetworkStatus = 'online'
  private listeners: Array<(status: NetworkStatus) => void> = []

  getStatus(): NetworkStatus {
    return this.status
  }

  setStatus(status: NetworkStatus): void {
    this.status = status
    this.listeners.forEach(fn => fn(status))
  }

  onStatusChange(fn: (status: NetworkStatus) => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  isOnline(): boolean {
    return this.status === 'online'
  }
}

// 模拟 API 客户端（带重试）
class ResilientAPIClient {
  private maxRetries = 3
  private retryDelay = 100 // ms

  async callWithRetry<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, error: Error) => void,
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const data = await fn()
        return { success: true, data }
      } catch (e) {
        const error = e instanceof Error ? e.message : '未知错误'
        onRetry?.(attempt, e instanceof Error ? e : new Error(error))

        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt))
        } else {
          return { success: false, error: `经过 ${this.maxRetries} 次重试后失败: ${error}` }
        }
      }
    }
    return { success: false, error: '未知错误' }
  }
}

// 错误分类器
function classifyAndRecover(error: string): {
  recoverable: boolean
  action: 'retry' | 'notify' | 'ignore'
  message: string
} {
  const lower = error.toLowerCase()

  // 网络错误 — 可恢复，建议重试
  if (/network|timeout|connection|econnrefused|econnreset|enotfound|etimedout/.test(lower)) {
    return { recoverable: true, action: 'retry', message: '网络连接异常，正在重试...' }
  }

  // 限流错误 — 可恢复，延迟重试
  if (/rate.?limit|throttl|429/.test(lower)) {
    return { recoverable: true, action: 'retry', message: '请求过于频繁，稍后重试...' }
  }

  // 权限错误 — 不可恢复，通知用户
  if (/permission|denied|unauthorized|forbidden/.test(lower)) {
    return { recoverable: false, action: 'notify', message: '权限不足，请检查配置' }
  }

  // 文件错误 — 不可恢复，通知用户
  if (/enoent|no such file|not found/.test(lower)) {
    return { recoverable: false, action: 'notify', message: '文件不存在，请检查路径' }
  }

  // 其他错误 — 通知用户
  return { recoverable: false, action: 'notify', message: '发生错误，请稍后重试' }
}

describe('错误恢复', () => {
  describe('NetworkManager', () => {
    it('初始状态应为 online', () => {
      const nm = new NetworkManager()
      expect(nm.getStatus()).toBe('online')
      expect(nm.isOnline()).toBe(true)
    })

    it('应能设置离线状态', () => {
      const nm = new NetworkManager()
      nm.setStatus('offline')
      expect(nm.getStatus()).toBe('offline')
      expect(nm.isOnline()).toBe(false)
    })

    it('应能设置重连状态', () => {
      const nm = new NetworkManager()
      nm.setStatus('reconnecting')
      expect(nm.getStatus()).toBe('reconnecting')
      expect(nm.isOnline()).toBe(false)
    })

    it('状态变化应通知监听器', () => {
      const nm = new NetworkManager()
      const statuses: NetworkStatus[] = []
      nm.onStatusChange(s => statuses.push(s))

      nm.setStatus('offline')
      nm.setStatus('reconnecting')
      nm.setStatus('online')

      expect(statuses).toEqual(['offline', 'reconnecting', 'online'])
    })

    it('取消订阅后不应再收到通知', () => {
      const nm = new NetworkManager()
      const statuses: NetworkStatus[] = []
      const unsub = nm.onStatusChange(s => statuses.push(s))

      nm.setStatus('offline')
      unsub()
      nm.setStatus('online')

      expect(statuses).toEqual(['offline'])
    })
  })

  describe('ResilientAPIClient', () => {
    it('成功的调用应直接返回', async () => {
      const client = new ResilientAPIClient()
      const result = await client.callWithRetry(async () => 'success')
      expect(result.success).toBe(true)
      expect(result.data).toBe('success')
    })

    it('失败的调用应重试指定次数', async () => {
      const client = new ResilientAPIClient()
      let attempts = 0
      const result = await client.callWithRetry(
        async () => {
          attempts++
          throw new Error('API Error')
        },
        () => { /* track retry */ },
      )
      expect(result.success).toBe(false)
      expect(attempts).toBe(3)
      expect(result.error).toContain('经过 3 次重试后失败')
    })

    it('第二次尝试成功应停止重试', async () => {
      const client = new ResilientAPIClient()
      let attempts = 0
      const result = await client.callWithRetry(async () => {
        attempts++
        if (attempts < 2) throw new Error('Temporary error')
        return 'recovered'
      })
      expect(result.success).toBe(true)
      expect(result.data).toBe('recovered')
      expect(attempts).toBe(2)
    })

    it('应调用重试回调', async () => {
      const client = new ResilientAPIClient()
      const retries: number[] = []
      await client.callWithRetry(
        async () => { throw new Error('fail') },
        (attempt) => { retries.push(attempt) },
      )
      expect(retries).toEqual([1, 2, 3])
    })
  })

  describe('错误分类与恢复策略', () => {
    it('网络错误应标记为可恢复+重试', () => {
      const result = classifyAndRecover('Connection timeout')
      expect(result.recoverable).toBe(true)
      expect(result.action).toBe('retry')
    })

    it('限流错误应标记为可恢复+重试', () => {
      const result = classifyAndRecover('Rate limit exceeded')
      expect(result.recoverable).toBe(true)
      expect(result.action).toBe('retry')
    })

    it('权限错误应标记为不可恢复+通知', () => {
      const result = classifyAndRecover('Permission denied')
      expect(result.recoverable).toBe(false)
      expect(result.action).toBe('notify')
    })

    it('文件不存在应标记为不可恢复+通知', () => {
      const result = classifyAndRecover('ENOENT: no such file')
      expect(result.recoverable).toBe(false)
      expect(result.action).toBe('notify')
    })

    it('未知错误应标记为不可恢复+通知', () => {
      const result = classifyAndRecover('Something unexpected happened')
      expect(result.recoverable).toBe(false)
      expect(result.action).toBe('notify')
    })
  })
})
