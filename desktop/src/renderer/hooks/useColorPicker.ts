/**
 * useColorPicker — 颜色选择器 Hook
 *
 * 检测文本中的颜色值，支持悬停预览和点击选择器。
 */

import { useState, useCallback, useEffect } from 'react'

export type ColorType = 'hex' | 'rgb' | 'hsl'

export interface SelectedColor {
  value: string
  displayValue: string
  type: ColorType
  startOffset: number
  endOffset: number
}

export interface UseColorPickerReturn {
  hoveredColor: SelectedColor | null
  pickerOpen: boolean
  selectedColor: SelectedColor | null
  handleEditorMouseMove: (event: { event: MouseEvent; lineNumber: number; column: number; element?: HTMLElement }) => void
  handleEditorMouseDown: () => void
  handlePickerChange: (color: SelectedColor) => void
  handlePickerClose: () => void
  clearHover: () => void
}

const COLOR_PATTERNS = [
  { type: 'hex' as ColorType, regex: /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/ },
  { type: 'rgb' as ColorType, regex: /rgba?\s*\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+\s*)?\)/i },
  { type: 'hsl' as ColorType, regex: /hsla?\s*\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*[\d.]+\s*)?\)/i },
]

export function useColorPicker(): UseColorPickerReturn {
  const [hoveredColor, setHoveredColor] = useState<SelectedColor | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedColor, setSelectedColor] = useState<SelectedColor | null>(null)

  const findColorAtPosition = useCallback((lineContent: string, column: number): SelectedColor | null => {
    for (const pattern of COLOR_PATTERNS) {
      const match = pattern.regex.exec(lineContent)
      if (match && match.index <= column - 1 && match.index + match[0].length >= column) {
        const startOffset = match.index
        const endOffset = match.index + match[0].length
        return {
          value: match[0],
          displayValue: match[0],
          type: pattern.type,
          startOffset,
          endOffset,
        }
      }
    }
    return null
  }, [])

  const handleEditorMouseMove = useCallback((event: { event: MouseEvent; lineNumber: number; column: number }) => {
    // 由 MonacoEditorPanel 传递行内容和位置
    // 这里仅管理状态，实际查找由 editor hover provider 处理
    // Hook 对外暴露接口供外部调用
  }, [])

  const handleEditorMouseDown = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const handlePickerChange = useCallback((color: SelectedColor) => {
    setSelectedColor(color)
  }, [])

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const clearHover = useCallback(() => {
    setHoveredColor(null)
  }, [])

  return {
    hoveredColor,
    pickerOpen,
    selectedColor,
    handleEditorMouseMove,
    handleEditorMouseDown,
    handlePickerChange,
    handlePickerClose,
    clearHover,
  }
}
