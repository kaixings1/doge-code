/**
 * useTerminal — 多标签终端状态 Hook
 *
 * 提供：
 * - 终端列表 / 活跃标签
 * - 创建 / 切换 / 关闭标签
 * - 输出历史缓存
 * - 数据写入 / 尺寸调整 / 清屏
 */

import { useState, useCallback, useEffect, useRef } from 'react'

export interface TerminalTab {
  id: string
  title: string
  cwd: string
  status: 'loading' | 'ready' | 'error'
}

export interface UseTerminalReturn {
  tabs: TerminalTab[]
  activeTabId: string | null
  outputs: Record<string, string[]>
  activeOutput: string[]
  createTerminal: () => Promise<void>
  switchTerminal: (tabId: string) => void
  closeTerminal: (tabId: string) => Promise<void>
  writeTerminal: (tabId: string, data: string) => Promise<void>
  resizeTerminal: (tabId: string, cols: number, rows: number) => Promise<void>
  clearOutput: (tabId: string) => void
}

const terminalIdRef = new Map<string, string>()
const unsubDataRef = new Map<string, () => void>()
const unsubExitRef = new Map<string, () => void>()

export function useTerminal(cwd: string): UseTerminalReturn {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Record<string, string[]>>({})
  const cwdRef = useRef(cwd)
  const tabIdCounterRef = useRef(0)
  const initializedRef = useRef(false)

  useEffect(() => {
    cwdRef.current = cwd
  }, [cwd])

  const createTerminal = useCallback(async () => {
    const targetCwd = cwdRef.current || '/'
    const tabId = `term-${Date.now()}-${tabIdCounterRef.current++}`
    const title = `终端 ${tabIdCounterRef.current}`

    setTabs(prev => {
      const next: TerminalTab[] = [...prev, { id: tabId, title, cwd: targetCwd, status: 'loading' }]
      setActiveTabId(tabId)
      return next
    })

    try {
      const api = (window as any).dogeAPI
      if (!api?.spawnTerminal) {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'error' } : t))
        return
      }

      const result = await api.spawnTerminal(targetCwd)
      if (result?.success && result.id) {
        terminalIdRef.set(tabId, result.id)
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'ready' } : t))

        const unsubData = api.onTerminalData((id: string, data: string) => {
          let targetTabId: string | null = null
          terminalIdRef.forEach((ptyId: string, tid: string) => {
            if (ptyId === id) targetTabId = tid
          })
          if (!targetTabId) return

          setOutputs(prev => {
            const lines = (prev[targetTabId!] || []).slice(-2000)
            const parts = data.split(/\r?\n/g)
            for (let i = 0; i < parts.length; i++) {
              lines.push(parts[i])
            }
            return { ...prev, [targetTabId!]: lines }
          })
        })

        const unsubExit = api.onTerminalExit((id: string) => {
          let targetTabId: string | null = null
          terminalIdRef.forEach((ptyId: string, tid: string) => {
            if (ptyId === id) targetTabId = tid
          })
          if (!targetTabId) return

          setTabs(prev => prev.map(t => t.id === targetTabId ? { ...t, status: 'error' } : t))
          setOutputs(prev => ({
            ...prev,
            [targetTabId!]: [...(prev[targetTabId!] || []), '\r\n\x1b[33m[进程已退出]\x1b[0m'],
          }))
        })

        unsubDataRef.set(tabId, unsubData)
        unsubExitRef.set(tabId, unsubExit)
      } else {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'error' } : t))
      }
    } catch {
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'error' } : t))
    }
  }, [])

  const switchTerminal = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  const closeTerminal = useCallback(async (tabId: string) => {
    const api = (window as any).dogeAPI
    const ptyId = terminalIdRef.get(tabId)
    if (ptyId && api?.terminalKill) {
      await api.terminalKill(ptyId)
      terminalIdRef.delete(tabId)
    }

    unsubDataRef.get(tabId)?.()
    unsubExitRef.get(tabId)?.()
    unsubDataRef.delete(tabId)
    unsubExitRef.delete(tabId)

    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId) {
        const newActive = next.length > 0 ? next[next.length - 1].id : null
        setActiveTabId(newActive)
      }
      return next
    })
  }, [activeTabId])

  const writeTerminal = useCallback(async (tabId: string, data: string) => {
    const ptyId = terminalIdRef.get(tabId)
    const api = (window as any).dogeAPI
    if (!ptyId || !api?.terminalWrite) return
    await api.terminalWrite(ptyId, data)
  }, [])

  const resizeTerminal = useCallback(async (tabId: string, cols: number, rows: number) => {
    const ptyId = terminalIdRef.get(tabId)
    const api = (window as any).dogeAPI
    if (!ptyId || !api?.terminalResize) return
    await api.terminalResize(ptyId, cols, rows)
  }, [])

  const clearOutput = useCallback((tabId: string) => {
    setOutputs(prev => ({ ...prev, [tabId]: [] }))
  }, [])

  // 自动创建第一个终端
  useEffect(() => {
    if (!initializedRef.current && tabs.length === 0) {
      initializedRef.current = true
      createTerminal()
    }
  }, [tabs.length, createTerminal])

  const activeTab = tabs.find(t => t.id === activeTabId) || null
  const activeOutput = activeTabId ? (outputs[activeTabId] || []) : []

  return {
    tabs,
    activeTabId,
    outputs,
    activeOutput,
    createTerminal,
    switchTerminal,
    closeTerminal,
    writeTerminal,
    resizeTerminal,
    clearOutput,
  }
}
