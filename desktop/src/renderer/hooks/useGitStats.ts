/**
 * useGitStats — Git 统计 Hook
 *
 * 提供 Git 仓库统计功能：
 * - 获取 Git 提交日志（通过 IPC）
 * - 计算每日提交数
 * - 计算代码行数变化
 * - 计算活跃度数据
 * - 数据缓存（避免重复计算）
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface GitCommit {
  hash: string
  date: string
  author: string
  message: string
  additions: number
  deletions: number
}

export interface DailyStat {
  date: string
  commits: number
  additions: number
  deletions: number
}

export interface GitStats {
  totalCommits: number
  totalAdditions: number
  totalDeletions: number
  dailyStats: DailyStat[]
  heatmapData: { date: string; count: number }[]
  authors: Record<string, number>
}

interface UseGitStatsReturn {
  stats: GitStats | null
  loading: boolean
  error: string | null
  refresh: () => void
  getCommitsByDateRange: (start: string, end: string) => DailyStat[]
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function useGitStats(cwd: string): UseGitStatsReturn {
  const [stats, setStats] = useState<GitStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<{ data: GitStats; timestamp: number } | null>(null)

  const fetchStats = useCallback(async () => {
    if (!cwd) return

    // 检查缓存
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < CACHE_TTL) {
      setStats(cacheRef.current.data)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 尝试通过 IPC 获取
      let commits: GitCommit[] = []

      // 使用 git log 命令获取提交历史
      const result = await window.dogeAPI?.executeCommand('log', [
        '--pretty=format:%H|%ai|%an|%s',
        '--shortstat',
        '--no-merges',
      ])
      if (result?.success && result.output) {
        commits = parseGitLog(result.output)
      }

      const dailyMap = new Map<string, DailyStat>()
      const authors: Record<string, number> = {}
      let totalAdditions = 0
      let totalDeletions = 0

      for (const commit of commits) {
        const date = commit.date.slice(0, 10)
        const existing = dailyMap.get(date) || { date, commits: 0, additions: 0, deletions: 0 }
        existing.commits++
        existing.additions += commit.additions
        existing.deletions += commit.deletions
        dailyMap.set(date, existing)

        authors[commit.author] = (authors[commit.author] || 0) + 1
        totalAdditions += commit.additions
        totalDeletions += commit.deletions
      }

      const dailyStats = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

      // 生成热力图数据（最近 365 天）
      const heatmapData: { date: string; count: number }[] = []
      const today = new Date()
      for (let i = 364; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const stat = dailyMap.get(dateStr)
        heatmapData.push({ date: dateStr, count: stat?.commits || 0 })
      }

      const computed: GitStats = {
        totalCommits: commits.length,
        totalAdditions,
        totalDeletions,
        dailyStats,
        heatmapData,
        authors,
      }

      cacheRef.current = { data: computed, timestamp: Date.now() }
      setStats(computed)
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取 Git 统计失败')
    } finally {
      setLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const refresh = useCallback(() => {
    cacheRef.current = null
    fetchStats()
  }, [fetchStats])

  const getCommitsByDateRange = useCallback((start: string, end: string): DailyStat[] => {
    if (!stats) return []
    return stats.dailyStats.filter(d => d.date >= start && d.date <= end)
  }, [stats])

  return { stats, loading, error, refresh, getCommitsByDateRange }
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
