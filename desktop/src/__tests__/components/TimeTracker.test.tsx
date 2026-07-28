/**
 * TimeTracker 组件测试
 *
 * 测试时间追踪核心逻辑：
 * - 时间格式化
 * - 时间条目 CRUD
 * - 统计计算
 * - 预算计算
 * - CSV 导出
 */

import { describe, it, expect } from 'bun:test'

// 与 useTimeTracker hook 一致的接口
interface TimeEntry {
  id: string
  task: string
  project: string
  startTime: number
  endTime: number | null
  duration: number
  date: string
  isManual: boolean
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calculateTodayTotal(entries: TimeEntry[], now: number): number {
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  return entries
    .filter(e => e.startTime >= todayStart.getTime())
    .reduce((sum, e) => sum + e.duration, 0)
}

function exportCSV(entries: TimeEntry[]): string {
  const header = '日期,任务,项目,时长(秒),时长(分),类型\n'
  const rows = entries
    .sort((a, b) => b.startTime - a.startTime)
    .map(e => `${e.date},${e.task},${e.project},${e.duration},${(e.duration / 60).toFixed(1)},${e.isManual ? '手动' : '自动'}`)
    .join('\n')
  return header + rows
}

function calculateBudgetProgress(usedSeconds: number, budgetMinutes: number): number {
  return Math.min(100, (Math.floor(usedSeconds / 60) / budgetMinutes) * 100)
}

describe('TimeTracker', () => {
  describe('formatDuration', () => {
    it('应正确格式化秒数', () => {
      expect(formatDuration(0)).toBe('0:00')
      expect(formatDuration(30)).toBe('0:30')
      expect(formatDuration(60)).toBe('1:00')
      expect(formatDuration(90)).toBe('1:30')
    })

    it('应正确格式化小时', () => {
      expect(formatDuration(3600)).toBe('1:00:00')
      expect(formatDuration(3661)).toBe('1:01:01')
      expect(formatDuration(7200)).toBe('2:00:00')
    })

    it('应补零', () => {
      expect(formatDuration(65)).toBe('1:05')
      expect(formatDuration(3605)).toBe('1:00:05')
    })
  })

  describe('formatDate', () => {
    it('应正确格式化日期', () => {
      const ts = new Date(2024, 0, 15).getTime()
      expect(formatDate(ts)).toBe('2024-01-15')
    })

    it('应对月份和日期补零', () => {
      const ts = new Date(2024, 2, 5).getTime()
      expect(formatDate(ts)).toBe('2024-03-05')
    })
  })

  describe('calculateTodayTotal', () => {
    const now = Date.now()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    it('应计算今日总时长', () => {
      const entries: TimeEntry[] = [
        { id: '1', task: 'a', project: 'p', startTime: now - 1000, endTime: now, duration: 3600, date: formatDate(now), isManual: false },
        { id: '2', task: 'b', project: 'p', startTime: now - 2000, endTime: now, duration: 1800, date: formatDate(now), isManual: true },
      ]
      expect(calculateTodayTotal(entries, now)).toBe(5400)
    })

    it('应排除昨日条目', () => {
      const yesterday = todayStart.getTime() - 86400000
      const entries: TimeEntry[] = [
        { id: '1', task: 'a', project: 'p', startTime: yesterday, endTime: yesterday + 1000, duration: 7200, date: formatDate(yesterday), isManual: false },
      ]
      expect(calculateTodayTotal(entries, now)).toBe(0)
    })
  })

  describe('exportCSV', () => {
    it('应生成正确的 CSV 格式', () => {
      const now = Date.now()
      const entries: TimeEntry[] = [
        { id: '1', task: 'Task A', project: 'Project X', startTime: now, endTime: now + 1000, duration: 3600, date: formatDate(now), isManual: false },
      ]
      const csv = exportCSV(entries)
      expect(csv).toContain('日期,任务,项目,时长(秒),时长(分),类型')
      expect(csv).toContain('Task A')
      expect(csv).toContain('Project X')
      expect(csv).toContain('3600')
    })

    it('应按时间倒序排列', () => {
      const now = Date.now()
      const entries: TimeEntry[] = [
        { id: '1', task: 'old', project: 'p', startTime: now - 86400000, endTime: now, duration: 60, date: formatDate(now - 86400000), isManual: false },
        { id: '2', task: 'new', project: 'p', startTime: now, endTime: now + 1000, duration: 120, date: formatDate(now), isManual: false },
      ]
      const csv = exportCSV(entries)
      const lines = csv.split('\n')
      expect(lines[1]).toContain('new')
    })
  })

  describe('calculateBudgetProgress', () => {
    it('应计算预算进度', () => {
      expect(calculateBudgetProgress(0, 480)).toBe(0)
      expect(calculateBudgetProgress(3600, 60)).toBe(100)
      expect(calculateBudgetProgress(1800, 60)).toBe(50)
    })

    it('应限制在 100%', () => {
      expect(calculateBudgetProgress(7200, 60)).toBe(100)
    })
  })
})
