import type { StructuredPatchHunk } from 'diff'
import { useEffect, useMemo, useState } from 'react'
import {
  fetchGitDiff,
  fetchGitDiffHunks,
  type GitDiffResult,
  type GitDiffStats,
} from '../utils/gitDiff.js'

const MAX_LINES_PER_FILE = 400

export type DiffFile = {
  path: string
  linesAdded: number
  linesRemoved: number
  isBinary: boolean
  isLargeFile: boolean
  isTruncated: boolean
  isNewFile?: boolean
  isUntracked?: boolean
}

export type DiffData = {
  stats: GitDiffStats | null
  files: DiffFile[]
  hunks: Map<string, StructuredPatchHunk[]>
  loading: boolean
}

/**
 * Hook，用于按需获取当前 git diff 数据。
 * 在组件挂载时获取统计信息和 hunks。
 */
export function useDiffData(): DiffData {
  const [diffResult, setDiffResult] = useState<GitDiffResult | null>(null)
  const [hunks, setHunks] = useState<Map<string, StructuredPatchHunk[]>>(
    new Map(),
  )
  const [loading, setLoading] = useState(true)

  // 挂载时获取 diff 数据
  useEffect(() => {
    let cancelled = false

    async function loadDiffData() {
      try {
        // 同时获取统计信息和 hunks
        const [statsResult, hunksResult] = await Promise.all([
          fetchGitDiff(),
          fetchGitDiffHunks(),
        ])

        if (!cancelled) {
          setDiffResult(statsResult)
          setHunks(hunksResult)
          setLoading(false)
        }
      } catch (_error) {
        if (!cancelled) {
          setDiffResult(null)
          setHunks(new Map())
          setLoading(false)
        }
      }
    }

    void loadDiffData()

    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(() => {
    if (!diffResult) {
      return { stats: null, files: [], hunks: new Map(), loading }
    }

    const { stats, perFileStats } = diffResult
    const files: DiffFile[] = []

      // 遍历 perFileStats 获取所有文件，包括大文件/跳过的文件
    for (const [path, fileStats] of perFileStats) {
      const fileHunks = hunks.get(path)
      const isUntracked = fileStats.isUntracked ?? false

      // 检测大文件（在 perFileStats 中但不在 hunks 中，且非二进制/未跟踪）
      const isLargeFile = !fileStats.isBinary && !isUntracked && !fileHunks

      // 检测截断文件（总数超过限制意味着已截断）
      const totalLines = fileStats.added + fileStats.removed
      const isTruncated =
        !isLargeFile && !fileStats.isBinary && totalLines > MAX_LINES_PER_FILE

      files.push({
        path,
        linesAdded: fileStats.added,
        linesRemoved: fileStats.removed,
        isBinary: fileStats.isBinary,
        isLargeFile,
        isTruncated,
        isUntracked,
      })
    }

    files.sort((a, b) => a.path.localeCompare(b.path))

    return { stats, files, hunks, loading: false }
  }, [diffResult, hunks, loading])
}
