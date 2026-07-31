/**
 * useProblems — 问题面板 Hook
 *
 * 聚合所有文件的 LSP 诊断结果，支持过滤和跳转。
 */

import { useState, useCallback, useEffect, useRef } from 'react'

export type ProblemLevel = 'error' | 'warning' | 'info'

export interface ProblemItem {
  id: string
  filePath: string
  line: number
  column: number
  level: ProblemLevel
  message: string
  source?: string
}

export interface UseProblemsReturn {
  problems: ProblemItem[]
  filteredProblems: ProblemItem[]
  filterLevels: ProblemLevel[]
  filterFiles: string[]
  setFilterLevels: (levels: ProblemLevel[]) => void
  setFilterFiles: (files: string[]) => void
  toggleFilterLevel: (level: ProblemLevel) => void
  toggleFilterFile: (file: string) => void
  clear: () => void
  refresh: () => void
}

const DEFAULT_LEVELS: ProblemLevel[] = ['error', 'warning', 'info']

export function useProblems(): UseProblemsReturn {
  const [problems, setProblems] = useState<ProblemItem[]>([])
  const [filterLevels, setFilterLevels] = useState<ProblemLevel[]>(DEFAULT_LEVELS)
  const [filterFiles, setFilterFiles] = useState<string[]>([])
  const listenersRef = useRef<(() => void) | null>(null)

  const processDiagnostics = useCallback((uri: string, diagnostics: any[]) => {
    if (!diagnostics?.length) return
    const items: ProblemItem[] = diagnostics.map((d, i) => ({
      id: `${uri}_${i}_${d.range?.start?.line ?? 0}_${d.range?.start?.character ?? 0}`,
      filePath: uri,
      line: (d.range?.start?.line ?? 0) + 1,
      column: d.range?.start?.character ?? 0,
      level: mapSeverity(d.severity),
      message: d.message || '',
      source: d.source,
    }))
    setProblems(prev => {
      const map = new Map(prev.map(p => [p.id, p]))
      for (const item of items) map.set(item.id, item)
      return Array.from(map.values())
    })
  }, [])

  useEffect(() => {
    const api = (window as any).dogeAPI
    if (!api?.onLspDiagnostic) return
    const unsub = api.onLspDiagnostic((_uri: string, diagnostics: any[]) => {
      processDiagnostics(_uri, diagnostics)
    })
    listenersRef.current = unsub
    return () => { if (unsub) unsub() }
  }, [processDiagnostics])

  const toggleFilterLevel = useCallback((level: ProblemLevel) => {
    setFilterLevels(prev => prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level])
  }, [])

  const toggleFilterFile = useCallback((file: string) => {
    setFilterFiles(prev => prev.includes(file) ? prev.filter(f => f !== file) : [...prev, file])
  }, [])

  const clear = useCallback(() => setProblems([]), [])

  const refresh = useCallback(() => {
    // 触发重连诊断流（重新订阅）
    if (listenersRef.current) {
      listenersRef.current()
    }
    const api = (window as any).dogeAPI
    if (api?.onLspDiagnostic) {
      const unsub = api.onLspDiagnostic((_uri: string, diagnostics: any[]) => {
        processDiagnostics(_uri, diagnostics)
      })
      listenersRef.current = unsub
    }
  }, [processDiagnostics])

  const filteredProblems = problems.filter(p => {
    if (!filterLevels.includes(p.level)) return false
    if (filterFiles.length > 0 && !filterFiles.includes(p.filePath)) return false
    return true
  })

  return {
    problems,
    filteredProblems,
    filterLevels,
    filterFiles,
    setFilterLevels,
    setFilterFiles,
    toggleFilterLevel,
    toggleFilterFile,
    clear,
    refresh,
  }
}

function mapSeverity(severity: number): ProblemLevel {
  if (severity <= 1) return 'error'
  if (severity === 2) return 'warning'
  return 'info'
}
