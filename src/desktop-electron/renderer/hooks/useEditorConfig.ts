/**
 * useEditorConfig — 编辑器配置状态管理 Hook
 *
 * 提供编辑器设置功能：
 * - tabSize / fontSize / wordWrap / minimap 等设置
 * - 设置持久化（localStorage）
 * - 格式化工具选择（Prettier / ESLint / Biome / dprint）
 * - 自动保存 / 自动格式化开关
 */

import { useCallback, useEffect, useState } from 'react'

export type FormatterTool = 'prettier' | 'eslint' | 'biome' | 'dprint'
export type WordWrap = 'off' | 'on' | 'wordWrapColumn' | 'bounded'

export interface EditorConfig {
  tabSize: 2 | 4
  fontSize: number
  wordWrap: WordWrap
  minimap: boolean
  codeFolding: boolean
  bracketHighlight: boolean
  autoSave: boolean
  autoFormat: boolean
  formatterTool: FormatterTool
  insertSpaces: boolean
  lineNumbers: boolean
  scrollBeyondLastLine: boolean
  renderWhitespace: boolean
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
}

const STORAGE_KEY = 'doge-editor-config'

const DEFAULT_CONFIG: EditorConfig = {
  tabSize: 2,
  fontSize: 13,
  wordWrap: 'off',
  minimap: true,
  codeFolding: true,
  bracketHighlight: true,
  autoSave: false,
  autoFormat: true,
  formatterTool: 'prettier',
  insertSpaces: true,
  lineNumbers: true,
  scrollBeyondLastLine: false,
  renderWhitespace: false,
  cursorBlinking: 'blink',
}

function loadConfig(): EditorConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: EditorConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch { /* ignore */ }
}

export interface UseEditorConfigReturn {
  config: EditorConfig
  updateConfig: (partial: Partial<EditorConfig>) => void
  resetConfig: () => void
  setTabSize: (size: 2 | 4) => void
  setFontSize: (size: number) => void
  setWordWrap: (wrap: WordWrap) => void
  toggleMinimap: () => void
  toggleCodeFolding: () => void
  toggleBracketHighlight: () => void
  toggleAutoSave: () => void
  toggleAutoFormat: () => void
  setFormatterTool: (tool: FormatterTool) => void
  setInsertSpaces: (insert: boolean) => void
  setLineNumbers: (show: boolean) => void
  setScrollBeyondLastLine: (scroll: boolean) => void
  setRenderWhitespace: (render: boolean) => void
  setCursorBlinking: (blinking: EditorConfig['cursorBlinking']) => void
}

export function useEditorConfig(): UseEditorConfigReturn {
  const [config, setConfig] = useState<EditorConfig>(loadConfig)

  // 持久化
  useEffect(() => {
    saveConfig(config)
  }, [config])

  const updateConfig = useCallback((partial: Partial<EditorConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }))
  }, [])

  const resetConfig = useCallback(() => {
    setConfig({ ...DEFAULT_CONFIG })
  }, [])

  const setTabSize = useCallback((size: 2 | 4) => {
    setConfig(prev => ({ ...prev, tabSize: size }))
  }, [])

  const setFontSize = useCallback((size: number) => {
    setConfig(prev => ({ ...prev, fontSize: Math.max(11, Math.min(18, size)) }))
  }, [])

  const setWordWrap = useCallback((wrap: WordWrap) => {
    setConfig(prev => ({ ...prev, wordWrap: wrap }))
  }, [])

  const toggleMinimap = useCallback(() => {
    setConfig(prev => ({ ...prev, minimap: !prev.minimap }))
  }, [])

  const toggleCodeFolding = useCallback(() => {
    setConfig(prev => ({ ...prev, codeFolding: !prev.codeFolding }))
  }, [])

  const toggleBracketHighlight = useCallback(() => {
    setConfig(prev => ({ ...prev, bracketHighlight: !prev.bracketHighlight }))
  }, [])

  const toggleAutoSave = useCallback(() => {
    setConfig(prev => ({ ...prev, autoSave: !prev.autoSave }))
  }, [])

  const toggleAutoFormat = useCallback(() => {
    setConfig(prev => ({ ...prev, autoFormat: !prev.autoFormat }))
  }, [])

  const setFormatterTool = useCallback((tool: FormatterTool) => {
    setConfig(prev => ({ ...prev, formatterTool: tool }))
  }, [])

  const setInsertSpaces = useCallback((insert: boolean) => {
    setConfig(prev => ({ ...prev, insertSpaces: insert }))
  }, [])

  const setLineNumbers = useCallback((show: boolean) => {
    setConfig(prev => ({ ...prev, lineNumbers: show }))
  }, [])

  const setScrollBeyondLastLine = useCallback((scroll: boolean) => {
    setConfig(prev => ({ ...prev, scrollBeyondLastLine: scroll }))
  }, [])

  const setRenderWhitespace = useCallback((render: boolean) => {
    setConfig(prev => ({ ...prev, renderWhitespace: render }))
  }, [])

  const setCursorBlinking = useCallback((blinking: EditorConfig['cursorBlinking']) => {
    setConfig(prev => ({ ...prev, cursorBlinking: blinking }))
  }, [])

  return {
    config,
    updateConfig,
    resetConfig,
    setTabSize,
    setFontSize,
    setWordWrap,
    toggleMinimap,
    toggleCodeFolding,
    toggleBracketHighlight,
    toggleAutoSave,
    toggleAutoFormat,
    setFormatterTool,
    setInsertSpaces,
    setLineNumbers,
    setScrollBeyondLastLine,
    setRenderWhitespace,
    setCursorBlinking,
  }
}
