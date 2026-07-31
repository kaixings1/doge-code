/**
 * useErrorLens — Error Lens Hook
 *
 * 获取并管理当前文件的 LSP 诊断结果，
 * 供 ErrorLensOverlay 组件展示。
 */

import { useState, useCallback, useEffect, useRef } from 'react'

export type DiagnosticLevel = 'error' | 'warning' | 'info'

export interface DiagnosticItem {
  id: string
  filePath: string
  line: number
  column: number
  level: DiagnosticLevel
  message: string
  source?: string
}

export interface UseErrorLensReturn {
  items: DiagnosticItem[]
  visible: boolean
  minLevel: DiagnosticLevel
  setVisible: (v: boolean) => void
  setMinLevel: (level: DiagnosticLevel) => void
  clear: () => void
}

export function useErrorLens(filePath: string): UseErrorLensReturn {
  const [items, setItems] = useState<DiagnosticItem[]>([])
  const [visible, setVisible] = useState(true)
  const [minLevel, setMinLevel] = useState<DiagnosticLevel>('info')
  const listenerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!filePath) { setItems([]); return }
    const api = (window as any).dogeAPI
    if (!api?.onLspDiagnostic) return

    const unsub = api.onLspDiagnostic((uri: string, diagnostics: any[]) => {
      if (uri !== filePath) return
      if (!diagnostics?.length) { setItems([]); return }
      const mapped: DiagnosticItem[] = diagnostics.map((d, i) => ({
        id: `${uri}_${i}_${d.range?.start?.line ?? 0}`,
        filePath: uri,
        line: (d.range?.start?.line ?? 0) + 1,
        column: d.range?.start?.character ?? 0,
        level: mapSeverity(d.severity),
        message: d.message || '',
        source: d.source,
      }))
      setItems(mapped)
    })
    listenerRef.current = unsub
    return () => { if (unsub) unsub() }
  }, [filePath])

  return {
    items: filterByLevel(items, minLevel),
    visible,
    minLevel,
    setVisible,
    setMinLevel,
    clear: () => setItems([]),
  }
}

function filterByLevel(items: DiagnosticItem[], minLevel: DiagnosticLevel): DiagnosticItem[] {
  const order: Record<DiagnosticLevel, number> = { error: 0, warning: 1, info: 2 }
  return items.filter(item => order[item.level] <= order[minLevel])
}

function mapSeverity(severity: number): DiagnosticLevel {
  if (severity <= 1) return 'error'
  if (severity === 2) return 'warning'
  return 'info'
}
