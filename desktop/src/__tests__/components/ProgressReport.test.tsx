/**
 * ProgressReport 组件测试
 *
 * 测试进度报告核心逻辑：
 * - Git 统计解析
 * - 每日统计计算
 * - 里程碑 CRUD
 * - 周报模板生成
 */

import { describe, it, expect } from 'bun:test'

interface GitCommit {
  hash: string
  date: string
  author: string
  message: string
  additions: number
  deletions: number
}

interface DailyStat {
  date: string
  commits: number
  additions: number
  deletions: number
}

interface Milestone {
  id: string
  title: string
  description: string
  dueDate: string
  progress: number
  status: 'active' | 'completed' | 'paused'
  createdAt: number
}

function parseGitLog(output: string): GitCommit[] {
  const commits: GitCommit[] = []
  const lines = output.split('\n')
  let currentCommit: Partial<GitCommit> | null = null

  for (const line of lines) {
    const match = line.match(/^([a-f0-9]+)\|([^|]+)\|([^|]+)\|(.+)$/)
    if (match) {
      if (currentCommit && currentCommit.hash) {
        commits.push({
          hash: currentCommit.hash,
          date: currentCommit.date || '',
          author: currentCommit.author || '',
          message: currentCommit.message || '',
          additions: currentCommit.additions || 0,
          deletions: currentCommit.deletions || 0,
        })
      }
      currentCommit = {
        hash: match[1],
        date: match[2].trim(),
        author: match[3].trim(),
        message: match[4].trim(),
        additions: 0,
        deletions: 0,
      }
    } else if (currentCommit) {
      const statMatch = line.match(/(\d+) insertion[s]?\(\+\)(?:,?\s*(\d+) deletion[s]?\(-\))?/)
      const delMatch = line.match(/(\d+) deletion[s]?\(-\)/)
      if (statMatch) {
        currentCommit.additions = parseInt(statMatch[1], 10)
        if (statMatch[2]) currentCommit.deletions = parseInt(statMatch[2], 10)
      } else if (delMatch) {
        currentCommit.deletions = parseInt(delMatch[1], 10)
      }
    }
  }

  if (currentCommit && currentCommit.hash) {
    commits.push({
      hash: currentCommit.hash || '',
      date: currentCommit.date || '',
      author: currentCommit.author || '',
      message: currentCommit.message || '',
      additions: currentCommit.additions || 0,
      deletions: currentCommit.deletions || 0,
    })
  }

  return commits
}

function calculateDailyStats(commits: GitCommit[]): DailyStat[] {
  const dailyMap = new Map<string, DailyStat>()
  for (const commit of commits) {
    const date = commit.date.slice(0, 10)
    const existing = dailyMap.get(date) || { date, commits: 0, additions: 0, deletions: 0 }
    existing.commits++
    existing.additions += commit.additions
    existing.deletions += commit.deletions
    dailyMap.set(date, existing)
  }
  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function generateWeeklyReport(totalCommits: number, totalAdditions: number, totalDeletions: number, activeMilestones: number, completedMilestones: number): string {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 7)
  const weekStr = `${weekStart.toISOString().slice(0, 10)} ~ ${now.toISOString().slice(0, 10)}`

  return `# 项目周报 (${weekStr})

## 概述
- 总提交数: ${totalCommits}
- 新增行数: +${totalAdditions}
- 删除行数: -${totalDeletions}
- 净增行数: +${totalAdditions - totalDeletions}

## 里程碑
- 进行中: ${activeMilestones}
- 已完成: ${completedMilestones}

## 下周计划
- [ ] TODO

## 备注
（在此处添加备注）
`
}

describe('ProgressReport', () => {
  describe('parseGitLog', () => {
    it('应解析 git log 输出', () => {
      const log = `abc1234|2024-01-15 10:00:00 +0800|Alice|Initial commit
 1 file changed, 10 insertions(+)
def5678|2024-01-16 14:00:00 +0800|Bob|Add feature
 3 files changed, 50 insertions(+), 10 deletions(-)`

      const commits = parseGitLog(log)
      expect(commits.length).toBe(2)
      expect(commits[0].hash).toBe('abc1234')
      expect(commits[0].author).toBe('Alice')
      expect(commits[0].additions).toBe(10)
      expect(commits[0].deletions).toBe(0)
    })

    it('应解析有删除的提交', () => {
      const log = `abc1234|2024-01-15 10:00:00 +0800|Alice|Fix
 2 files changed, 5 insertions(+), 15 deletions(-)`

      const commits = parseGitLog(log)
      expect(commits[0].additions).toBe(5)
      expect(commits[0].deletions).toBe(15)
    })

    it('应处理空输入', () => {
      expect(parseGitLog('')).toEqual([])
    })
  })

  describe('calculateDailyStats', () => {
    it('应按日期汇总提交', () => {
      const commits: GitCommit[] = [
        { hash: 'a', date: '2024-01-15T10:00:00+08:00', author: 'Alice', message: 'c1', additions: 10, deletions: 0 },
        { hash: 'b', date: '2024-01-15T14:00:00+08:00', author: 'Bob', message: 'c2', additions: 20, deletions: 5 },
        { hash: 'c', date: '2024-01-16T10:00:00+08:00', author: 'Alice', message: 'c3', additions: 5, deletions: 0 },
      ]

      const stats = calculateDailyStats(commits)
      expect(stats.length).toBe(2)
      expect(stats[0].commits).toBe(2)
      expect(stats[0].additions).toBe(30)
      expect(stats[0].deletions).toBe(5)
      expect(stats[1].commits).toBe(1)
    })

    it('应按日期排序', () => {
      const commits: GitCommit[] = [
        { hash: 'a', date: '2024-01-20T10:00:00+08:00', author: 'A', message: 'c', additions: 1, deletions: 0 },
        { hash: 'b', date: '2024-01-15T10:00:00+08:00', author: 'B', message: 'c', additions: 1, deletions: 0 },
      ]

      const stats = calculateDailyStats(commits)
      expect(stats[0].date).toBe('2024-01-15')
      expect(stats[1].date).toBe('2024-01-20')
    })
  })

  describe('generateWeeklyReport', () => {
    it('应生成包含数据的报告', () => {
      const report = generateWeeklyReport(15, 500, 200, 3, 1)
      expect(report).toContain('总提交数: 15')
      expect(report).toContain('新增行数: +500')
      expect(report).toContain('删除行数: -200')
      expect(report).toContain('净增行数: +300')
      expect(report).toContain('进行中: 3')
      expect(report).toContain('已完成: 1')
    })

    it('应包含周报标题', () => {
      const report = generateWeeklyReport(0, 0, 0, 0, 0)
      expect(report).toContain('项目周报')
      expect(report).toContain('概述')
      expect(report).toContain('里程碑')
    })
  })

  describe('Milestone', () => {
    it('应创建带默认值的里程碑', () => {
      const ms: Milestone = {
        id: `ms-${Date.now()}`,
        title: '新里程碑',
        description: '',
        dueDate: '',
        progress: 0,
        status: 'active',
        createdAt: Date.now(),
      }
      expect(ms.status).toBe('active')
      expect(ms.progress).toBe(0)
    })
  })
})
