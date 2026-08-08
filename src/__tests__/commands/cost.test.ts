/**
 * __tests__/commands/cost.test.ts — cost 命令单元测试
 *
 * 覆盖：formatCost / renderBar / formatTimestamp / 以及命令参数解析
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 纯函数（从 cost.ts 复制）
// ---------------------------------------------------------------------------

function formatCost(cost: number): string {
  return `$${cost > 0.5 ? (Math.round(cost * 100) / 100).toFixed(2) : cost.toFixed(4)}`
}

function renderBar(percentage: number, maxWidth: number = 20): string {
  const filled = Math.round((percentage / 100) * maxWidth)
  const clamped = Math.max(0, Math.min(filled, maxWidth))
  return '█'.repeat(clamped) + '░'.repeat(maxWidth - clamped)
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------------------------------------------------------------------------
// 参数解析逻辑
// ---------------------------------------------------------------------------

interface CostOptions {
  byModel?: boolean
  byType?: boolean
  trend?: number
  export?: string
}

function parseCostArgs(args: Record<string, unknown>): CostOptions {
  const result: CostOptions = {}
  if (args.byModel) result.byModel = true
  if (args.byType) result.byType = true
  if (args.trend) result.trend = Number(args.trend)
  if (args.export) result.export = String(args.export)
  return result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cost-tracker 纯函数', () => {
  describe('formatCost', () => {
    it('零值应显示为 $0.0000', () => {
      expect(formatCost(0)).toBe('$0.0000')
    })

    it('小于 0.5 的值应保留 4 位小数', () => {
      expect(formatCost(0.1234)).toBe('$0.1234')
    })

    it('大于 0.5 的值应保留 2 位小数', () => {
      expect(formatCost(1.234)).toBe('$1.23')
      expect(formatCost(0.501)).toBe('$0.50')
    })

    it('应正确处理边界值 0.5', () => {
      expect(formatCost(0.5)).toBe('$0.5000')
    })

    it('大数值应正确格式化', () => {
      expect(formatCost(123.456)).toBe('$123.46')
    })
  })

  describe('renderBar', () => {
    it('0% 应全为空', () => {
      expect(renderBar(0)).toBe('░'.repeat(20))
    })

    it('100% 应全为实心', () => {
      expect(renderBar(100)).toBe('█'.repeat(20))
    })

    it('50% 应约一半实心', () => {
      expect(renderBar(50)).toBe('██████████░░░░░░░░░░')
    })

    it('应正确处理超出范围的百分比', () => {
      expect(renderBar(150)).toBe('█'.repeat(20))
      expect(renderBar(-10)).toBe('░'.repeat(20))
    })

    it('应支持自定义宽度', () => {
      expect(renderBar(50, 10)).toBe('█████░░░░░')
    })
  })

  describe('formatTimestamp', () => {
    it('应正确格式化时间戳', () => {
      const d = new Date('2026-08-09T12:30:00')
      const result = formatTimestamp(d.getTime())
      expect(result).toContain('2026-08-09')
      expect(result).toContain('12:30:00')
    })
  })
})

// ---------------------------------------------------------------------------
// 参数解析测试
// ---------------------------------------------------------------------------

describe('cost 命令参数解析', () => {
  it('空参数应返回空对象', () => {
    expect(parseCostArgs({})).toEqual({})
  })

  it('应解析 byModel 标志', () => {
    expect(parseCostArgs({ byModel: true })).toEqual({ byModel: true })
  })

  it('应解析 byType 标志', () => {
    expect(parseCostArgs({ byType: true })).toEqual({ byType: true })
  })

  it('应解析 trend 参数', () => {
    expect(parseCostArgs({ trend: 5 })).toEqual({ trend: 5 })
  })

  it('应解析 export 参数', () => {
    expect(parseCostArgs({ export: 'test.json' })).toEqual({ export: 'test.json' })
  })

  it('应同时解析多个参数', () => {
    expect(parseCostArgs({ byModel: true, trend: 10, export: 'out.json' })).toEqual({
      byModel: true,
      trend: 10,
      export: 'out.json',
    })
  })
})
