/**
 * useBreadcrumb — 面包屑导航 Hook
 *
 * 提供：
 * - 根据 Monaco 光标位置查找当前符号层级
 * - 返回面包屑路径数组
 */

import { useState, useCallback, useEffect, useRef } from 'react'

export interface BreadcrumbItem {
  name: string
  kind: string
  range: {
    startLine: number
    startColumn: number
    endLine: number
    endColumn: number
  }
}

export interface UseBreadcrumbReturn {
  breadcrumbs: BreadcrumbItem[]
  loading: boolean
}

function normalizeSymbolKind(kind: number | string): string {
  if (typeof kind === 'number') {
    const map: Record<number, string> = {
      1: 'function', 2: 'method', 3: 'class', 4: 'interface', 5: 'type',
      6: 'variable', 7: 'constant', 8: 'enum', 9: 'module', 10: 'property',
    }
    return map[kind] || 'symbol'
  }
  return kind
}

function symbolMatchesRange(symbol: any, line: number, column: number): boolean {
  const range = symbol.range || symbol.location?.range
  if (!range) return false
  const startLine = range.start?.line ?? range.startLine ?? 0
  const startColumn = range.start?.character ?? range.startColumn ?? 0
  const endLine = range.end?.line ?? range.endLine ?? startLine
  const endColumn = range.end?.character ?? range.endColumn ?? Number.MAX_SAFE_INTEGER
  if (line < startLine || line > endLine) return false
  if (line === startLine && column < startColumn) return false
  if (line === endLine && column > endColumn) return false
  return true
}

function findContaining(symbols: any[], line: number, column: number): any | null {
  for (const symbol of symbols) {
    if (symbolMatchesRange(symbol, line, column)) {
      const childMatch = symbol.children ? findContaining(symbol.children, line, column) : null
      return childMatch || symbol
    }
  }
  return null
}

function buildBreadcrumbs(symbols: any[], line: number, column: number): any[] {
  const result: any[] = []
  let current = findContaining(symbols, line, column)
  while (current) {
    result.unshift(current)
    current = findContaining(symbols, current.range.start.line, current.range.start.character)
  }
  return result
}

export function useBreadcrumb(
  editor: any,
  filePath: string,
  enabled = true,
): UseBreadcrumbReturn {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const [loading, setLoading] = useState(false)
  const filePathRef = useRef(filePath)
  const enabledRef = useRef(enabled)

  useEffect(() => {
    filePathRef.current = filePath
    enabledRef.current = enabled
  }, [filePath, enabled])

  useEffect(() => {
    if (!editor || !filePath || !enabled) return

    const update = async () => {
      if (!enabledRef.current || !filePathRef.current) return
      const position = editor.getPosition()
      if (!position) return

      setLoading(true)
      try {
        const api = (window as any).dogeAPI
        let symbols: any[] = []
        if (api?.lspDocumentSymbol) {
          const result = await api.lspDocumentSymbol(filePathRef.current)
          if (result?.success && Array.isArray(result.symbols)) {
            symbols = result.symbols
          }
        }

        if (symbols.length === 0 && api?.getOutline) {
          const result = await api.getOutline({ filePath: filePathRef.current })
          if (result?.success && Array.isArray(result.symbols)) {
            symbols = result.symbols
          }
        }

        const line = position.lineNumber - 1
        const column = position.column - 1
        const chain = buildBreadcrumbs(symbols, line, column)
        setBreadcrumbs(
          chain.map((s) => ({
            name: s.name,
            kind: normalizeSymbolKind(s.kind),
            range: {
              startLine: s.range.start?.line ?? s.range.startLine ?? 0,
              startColumn: s.range.start?.character ?? s.range.startColumn ?? 0,
              endLine: s.range.end?.line ?? s.range.endLine ?? 0,
              endColumn: s.range.end?.character ?? s.range.endColumn ?? 0,
            },
          })),
        )
      } catch {
        // ignore breadcrumb errors
      } finally {
        setLoading(false)
      }
    }

    const disposeCursor = editor.onDidChangeCursorPosition(() => {
      update()
    })

    update()

    return () => {
      disposeCursor.dispose()
    }
  }, [editor, filePath, enabled])

  return {
    breadcrumbs,
    loading,
  }
}
