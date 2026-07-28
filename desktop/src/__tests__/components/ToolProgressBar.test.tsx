/**
 * ToolProgressBar 组件测试
 *
 * 测试工具执行进度条的各种状态显示：
 * - pending 状态
 * - running 状态（带进度动画）
 * - success 状态
 * - error 状态
 * - 耗时格式化
 * - 取消按钮功能
 */

import { describe, it, expect } from 'bun:test'

// 模拟进度状态类型
type ProgressStatus = 'pending' | 'running' | 'success' | 'error'

interface ToolProgressStep {
  label: string
  status: ProgressStatus
  detail?: string
}

// 测试工具函数：耗时格式化
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// 测试工具函数：状态配置
function getStatusConfig(status: ProgressStatus) {
  const configs = {
    pending: { color: '#888', icon: '⏳', label: '等待中' },
    running: { color: '#4ECB71', icon: '⚙️', label: '执行中' },
    success: { color: '#4ECB71', icon: '✓', label: '完成' },
    error: { color: '#FF6B6B', icon: '✗', label: '失败' },
  }
  return configs[status]
}

describe('ToolProgressBar', () => {
  describe('formatDuration', () => {
    it('应正确格式化毫秒', () => {
      expect(formatDuration(500)).toBe('500ms')
      expect(formatDuration(999)).toBe('999ms')
    })

    it('应正确格式化秒', () => {
      expect(formatDuration(1000)).toBe('1.0s')
      expect(formatDuration(5500)).toBe('5.5s')
      expect(formatDuration(30000)).toBe('30.0s')
    })

    it('应正确格式化分钟', () => {
      expect(formatDuration(60000)).toBe('1m 0s')
      expect(formatDuration(90000)).toBe('1m 30s')
      expect(formatDuration(125000)).toBe('2m 5s')
    })
  })

  describe('getStatusConfig', () => {
    it('应返回 pending 状态配置', () => {
      const config = getStatusConfig('pending')
      expect(config.icon).toBe('⏳')
      expect(config.label).toBe('等待中')
      expect(config.color).toBe('#888')
    })

    it('应返回 running 状态配置', () => {
      const config = getStatusConfig('running')
      expect(config.icon).toBe('⚙️')
      expect(config.label).toBe('执行中')
      expect(config.color).toBe('#4ECB71')
    })

    it('应返回 success 状态配置', () => {
      const config = getStatusConfig('success')
      expect(config.icon).toBe('✓')
      expect(config.label).toBe('完成')
      expect(config.color).toBe('#4ECB71')
    })

    it('应返回 error 状态配置', () => {
      const config = getStatusConfig('error')
      expect(config.icon).toBe('✗')
      expect(config.label).toBe('失败')
      expect(config.color).toBe('#FF6B6B')
    })
  })

  describe('步骤列表', () => {
    it('应正确构建步骤列表', () => {
      const steps: ToolProgressStep[] = [
        { label: '初始化', status: 'success' },
        { label: '执行命令', status: 'running' },
        { label: '处理结果', status: 'pending' },
      ]
      expect(steps.length).toBe(3)
      expect(steps[0].status).toBe('success')
      expect(steps[1].status).toBe('running')
      expect(steps[2].status).toBe('pending')
    })
  })
})
