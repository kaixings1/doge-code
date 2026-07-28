/**
 * useTabManager — 多 Tab 会话管理 Hook
 *
 * 提供多标签页会话管理功能：
 * - 创建/关闭/切换标签页
 * - 标签页消息同步
 * - 标签页持久化（localStorage）
 * - 自动标题更新
 */

import { useCallback, useRef, useState } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool'
  content: string
}

interface AppTab {
  id: string
  sessionId: string
  title: string
  messages: Message[]
}

interface UseTabManagerReturn {
  tabs: AppTab[]
  activeTabId: string | null
  createTab: (sessionId?: string) => void
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  updateTabMessages: (tabId: string, messages: Message[]) => void
  updateTabTitle: (tabId: string, title: string) => void
  setActiveTabId: (tabId: string | null) => void
}

const STORAGE_KEY = 'doge-tabs'
const MAX_TITLE_LENGTH = 30

function loadTabMeta(): Array<{ id: string; sessionId: string; title: string }> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return []
}

function saveTabMeta(tabs: AppTab[]): void {
  try {
    const meta = tabs.map(t => ({ id: t.id, sessionId: t.sessionId, title: t.title }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta))
  } catch { /* ignore */ }
}

export function useTabManager(): UseTabManagerReturn {
  const [tabs, setTabs] = useState<AppTab[]>(() => {
    const meta = loadTabMeta()
    return meta.length > 0 ? meta.map(m => ({ ...m, messages: [] })) : []
  })
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const tabIdCounter = useRef(tabs.length)
  const titleUpdatedRef = useRef<Set<string>>(new Set())

  const createTab = useCallback((sessionId: string = '') => {
    tabIdCounter.current += 1
    const newTab: AppTab = {
      id: `tab-${tabIdCounter.current}-${Date.now()}`,
      sessionId,
      title: `对话 ${tabIdCounter.current}`,
      messages: [],
    }
    setTabs(prev => {
      const next = [...prev, newTab]
      saveTabMeta(next)
      return next
    })
    setActiveTabId(newTab.id)
  }, [])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx === -1) return prev
      const remaining = prev.filter(t => t.id !== tabId)
      saveTabMeta(remaining)

      // 如果关闭的是当前 tab，切换到相邻 tab
      if (tabId === activeTabId) {
        if (remaining.length > 0) {
          const newIdx = Math.min(idx, remaining.length - 1)
          setActiveTabId(remaining[newIdx].id)
        } else {
          // 创建新 tab
          tabIdCounter.current += 1
          const newTab: AppTab = {
            id: `tab-${tabIdCounter.current}-${Date.now()}`,
            sessionId: '',
            title: `对话 ${tabIdCounter.current}`,
            messages: [],
          }
          setActiveTabId(newTab.id)
          const next = [newTab]
          saveTabMeta(next)
          return next
        }
      }
      return remaining
    })
  }, [activeTabId])

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  const updateTabMessages = useCallback((tabId: string, messages: Message[]) => {
    setTabs(prev => {
      const next = prev.map(t => t.id === tabId ? { ...t, messages } : t)
      saveTabMeta(next)
      return next
    })
  }, [])

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    if (titleUpdatedRef.current.has(tabId)) return
    titleUpdatedRef.current.add(tabId)
    setTabs(prev => {
      const next = prev.map(t => t.id === tabId ? { ...t, title: title.slice(0, MAX_TITLE_LENGTH) + (title.length > MAX_TITLE_LENGTH ? '...' : '') } : t)
      saveTabMeta(next)
      return next
    })
  }, [])

  return {
    tabs,
    activeTabId,
    createTab,
    closeTab,
    switchTab,
    updateTabMessages,
    updateTabTitle,
    setActiveTabId,
  }
}
