/**
 * 桌面端快捷键绑定 Hook
 * 在 Electron 渲染进程中使用，集中管理所有全局快捷键
 */

import React from 'react'

export interface KeybindingCallbacks {
  onCommandPalette: () => void
  onCommandPaletteFiles: () => void
  onCommandPaletteCommands: () => void
  onNewSession: () => void
  onCloseSession: () => void
  onOpenSettings: () => void
  onFocusInput: () => void
  onClear: () => void
  onToggleSidebar: () => void
  onToggleShortcuts: () => void
  onToggleTerminal: () => void
  onHistorySearch: () => void
}

export interface KeybindingDeps {
  showCommandPalette: boolean
  showSettings: boolean
  showShortcuts: boolean
  showSessions: boolean
}

const noop = () => {}

export function useCommandKeybindings(
  deps: KeybindingDeps,
  cbs: KeybindingCallbacks
): void {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { showCommandPalette, showSettings, showShortcuts, showSessions } = deps

      // Ctrl+P → 文件搜索面板
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        cbs.onCommandPaletteFiles()
        return
      }

      // Ctrl+Shift+P → 命令面板
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault()
        cbs.onCommandPaletteCommands()
        return
      }

      // Ctrl+N → 新建会话
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        cbs.onNewSession()
        return
      }

      // Ctrl+W → 关闭当前会话
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        cbs.onCloseSession()
        return
      }

      // Ctrl+, → 打开设置
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        cbs.onOpenSettings()
        return
      }

      // Ctrl+/ → 聚焦输入框
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault()
        cbs.onFocusInput()
        return
      }

      // Ctrl+L → 清除对话
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault()
        cbs.onClear()
        return
      }

      // Ctrl+B → 切换侧边栏
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        cbs.onToggleSidebar()
        return
      }

      // Ctrl+R → 历史搜索
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault()
        cbs.onHistorySearch()
        return
      }

      // Ctrl+` → 切换终端
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault()
        cbs.onToggleTerminal()
        return
      }

      // Esc → 关闭弹出面板
      if (e.key === 'Escape') {
        if (showCommandPalette) {
          cbs.onCommandPalette()
        } else if (showSettings) {
          cbs.onOpenSettings()
        } else if (showShortcuts) {
          cbs.onToggleShortcuts()
        } else if (showSessions) {
          cbs.onToggleShortcuts()
        }
        return
      }

      // ? → 快捷键帮助（非弹窗状态下）
      if (e.key === '?' && !showCommandPalette && !showSettings) {
        e.preventDefault()
        cbs.onToggleShortcuts()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    deps.showCommandPalette,
    deps.showSettings,
    deps.showShortcuts,
    deps.showSessions,
    cbs,
  ])
}
