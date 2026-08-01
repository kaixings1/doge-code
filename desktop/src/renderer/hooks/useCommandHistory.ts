/**
 * useCommandHistory — 命令历史记录管理 Hook
 *
 * 提供命令历史记录功能：
 * - 记录执行过的命令
 * - 上下箭头导航历史
 * - 持久化到 localStorage
 * - 最大记录数限制
 */

import { useCallback, useRef, useState } from 'react'

interface CommandHistoryEntry {
  cmd: string
  time: number
}

export interface UseCommandHistoryReturn {
  commandHistory: CommandHistoryEntry[]
  addCommand: (cmd: string) => void
  navigateHistory: (direction: 'up' | 'down', currentInput: string) => string
  resetNavigation: () => void
  clearHistory: () => void
}

const STORAGE_KEY = 'doge-command-history'
const MAX_HISTORY = 100

function loadHistory(): CommandHistoryEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return []
}

function saveHistory(history: CommandHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY)))
  } catch { /* ignore */ }
}

export function useCommandHistory(): UseCommandHistoryReturn {
  const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>(loadHistory)
  const navIndexRef = useRef(-1)
  const draftRef = useRef('')

  const addCommand = useCallback((cmd: string) => {
    setCommandHistory(prev => {
      const next = [...prev, { cmd, time: Date.now() }].slice(-MAX_HISTORY)
      saveHistory(next)
      return next
    })
    navIndexRef.current = -1
  }, [])

  const navigateHistory = useCallback((direction: 'up' | 'down', currentInput: string): string => {
    const uniqueCmds = [...new Set(commandHistory.map(h => h.cmd))].reverse()
    if (uniqueCmds.length === 0) return currentInput

    if (direction === 'up') {
      const next = Math.min(navIndexRef.current + 1, uniqueCmds.length - 1)
      navIndexRef.current = next
      if (next === uniqueCmds.length - 1 && navIndexRef.current === -1) {
        draftRef.current = currentInput
      }
      return uniqueCmds[next] || currentInput
    } else {
      const next = Math.max(navIndexRef.current - 1, -1)
      navIndexRef.current = next
      return next === -1 ? (draftRef.current || '') : (uniqueCmds[next] || currentInput)
    }
  }, [commandHistory])

  const resetNavigation = useCallback(() => {
    navIndexRef.current = -1
    draftRef.current = ''
  }, [])

  const clearHistory = useCallback(() => {
    setCommandHistory([])
    localStorage.removeItem(STORAGE_KEY)
    navIndexRef.current = -1
  }, [])

  return { commandHistory, addCommand, navigateHistory, resetNavigation, clearHistory }
}
