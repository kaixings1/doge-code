import { useState, useCallback } from 'react'

export interface CommitInfo {
  sha: string
  shortSha: string
  author: string
  date: string
  message: string
  stats: Array<{ file: string; additions: number; deletions: number }>
}

export interface DiffStat {
  file: string
  additions: number
  deletions: number
  changeType: 'added' | 'modified' | 'deleted' | 'renamed'
}

export interface UseVersionCompareResult {
  commits: CommitInfo[]
  loading: boolean
  selectedCommit: CommitInfo | null
  diffStats: DiffStat[]
  selectCommit: (sha: string) => Promise<void>
  compareCommits: (shaA: string, shaB: string) => Promise<void>
  clearSelection: () => void
  loadCommits: () => Promise<void>
}

export function useVersionCompare(cwd: string): UseVersionCompareResult {
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null)
  const [diffStats, setDiffStats] = useState<DiffStat[]>([])

  const loadCommits = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.dogeAPI.getGitStats(cwd)
      const list: CommitInfo[] = (result.commits || []).map((item: { hash: string; date: string; author: string; message: string; additions: number; deletions: number }) => ({
        sha: item.hash,
        shortSha: item.hash.slice(0, 7),
        author: item.author,
        date: item.date,
        message: item.message,
        stats: [],
      }))
      setCommits(list)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [cwd])

  const selectCommit = useCallback(async (sha: string) => {
    setLoading(true)
    setSelectedCommit(null)
    setDiffStats([])
    try {
      const result = await window.dogeAPI.gitShow(cwd, sha)
      if (result.success) {
        const info: CommitInfo = {
          sha: result.sha,
          shortSha: result.sha.slice(0, 7),
          author: result.author,
          date: result.date,
          message: result.message,
          stats: result.stats || [],
        }
        setSelectedCommit(info)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [cwd])

  const compareCommits = useCallback(async (shaA: string, shaB: string) => {
    setLoading(true)
    setDiffStats([])
    try {
      const result = await window.dogeAPI.gitDiff(cwd, shaA, shaB)
      if (result.success) {
        const stats: DiffStat[] = (result.stats || []).map(item => ({
          file: item.file,
          additions: item.additions,
          deletions: item.deletions,
          changeType: (item.changeType || 'modified') as DiffStat['changeType'],
        }))
        setDiffStats(stats)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [cwd])

  const clearSelection = useCallback(() => {
    setSelectedCommit(null)
    setDiffStats([])
  }, [])

  return {
    commits,
    loading,
    selectedCommit,
    diffStats,
    selectCommit,
    compareCommits,
    clearSelection,
    loadCommits,
  }
}
