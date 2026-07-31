/**
 * useSymbolOutline — 符号大纲 Hook
 *
 * 提供：
 * - 获取当前文件符号树
 * - 优先使用 LSP documentSymbol，回退 getOutline
 * - 通过 CustomEvent('doge:symbol-jump') 通知外部跳转
 */

import { useState, useCallback, useEffect, useRef } from 'react'

export interface SymbolNode {
  id: string
  name: string
  kind: string
  range: {
    startLine: number
    startColumn: number
    endLine: number
    endColumn: number
  }
  children?: SymbolNode[]
  detail?: string
  modifiers?: string[]
}

export interface UseSymbolOutlineReturn {
  symbols: SymbolNode[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

function normalizeKind(kind: number | string): string {
  if (typeof kind === 'number') {
    const map: Record<number, string> = {
      1: 'function', 2: 'method', 3: 'class', 4: 'interface', 5: 'type',
      6: 'variable', 7: 'constant', 8: 'enum', 9: 'module', 10: 'property',
      11: 'import', 12: 'keyword', 13: 'string', 14: 'number', 15: 'regexp',
    }
    return map[kind] || 'unknown'
  }
  return kind
}

function mapNode(node: any, depth = 0): SymbolNode {
  return {
    id: `${node.name || node.id || 'sym'}_${depth}_${Math.random().toString(36).slice(2, 8)}`,
    name: node.name || 'unknown',
    kind: normalizeKind(node.kind),
    range: {
      startLine: node.range?.start?.line ?? node.range?.startLine ?? 0,
      startColumn: node.range?.start?.character ?? node.range?.startColumn ?? 0,
      endLine: node.range?.end?.line ?? node.range?.endLine ?? 0,
      endColumn: node.range?.end?.character ?? node.range?.endColumn ?? 0,
    },
    detail: node.detail || node.containerName || undefined,
    modifiers: node.modifiers || [],
    children: Array.isArray(node.children)
      ? node.children.slice(0, depth < 3 ? undefined : 0).map((c: any) => mapNode(c, depth + 1))
      : undefined,
  }
}

export function useSymbolOutline(filePath: string): UseSymbolOutlineReturn {
  const [symbols, setSymbols] = useState<SymbolNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshSeq = useRef(0)

  const load = useCallback(async () => {
    if (!filePath) {
      setSymbols([])
      setError(null)
      return
    }

    const seq = ++refreshSeq.current
    setLoading(true)
    setError(null)

    try {
      const api = (window as any).dogeAPI
      let result: any = null

      if (api?.lspDocumentSymbol) {
        result = await api.lspDocumentSymbol(filePath)
      }

      if (!result?.success || !Array.isArray(result.symbols) || result.symbols.length === 0) {
        if (api?.getOutline) {
          result = await api.getOutline({ filePath })
        }
      }

      if (seq !== refreshSeq.current) return

      if (result?.success && Array.isArray(result.symbols)) {
        setSymbols(result.symbols.map((s: any) => mapNode(s, 0)))
      } else {
        setSymbols([])
        setError(result?.error || '无法获取符号大纲')
      }
    } catch (e) {
      if (seq !== refreshSeq.current) return
      setError(e instanceof Error ? e.message : '获取符号大纲失败')
      setSymbols([])
    } finally {
      if (seq === refreshSeq.current) {
        setLoading(false)
      }
    }
  }, [filePath])

  useEffect(() => {
    load()
  }, [load])

  const refresh = useCallback(async () => {
    await load()
  }, [load])

  return {
    symbols,
    loading,
    error,
    refresh,
  }
}

export function jumpToSymbol(filePath: string, line: number, column?: number) {
  const event = new CustomEvent('doge:symbol-jump', {
    detail: { filePath, line, column: column ?? 1 },
  })
  window.dispatchEvent(event)
}
