/**
 * 桌面端 Vim 输入模式 Hook
 * 在 Electron 渲染进程中使用，为 textarea 提供 Vim 键绑定
 *
 * 支持的功能：
 * - Normal/Insert 模式切换（Esc 进入 Normal，i/a/o 等进入 Insert）
 * - 光标移动（h/j/k/l, w/b/e, 0/^/$）
 * - 删除操作（x, dd, dw, d$）
 * - 插入模式切换（i, a, A, I, o, O）
 * - 撤销（u）和重做（Ctrl+R）
 * - 复制粘贴（yy, p, P）
 * - 重复操作（.）
 */

import React from 'react'

export type VimMode = 'NORMAL' | 'INSERT'

interface VimState {
  mode: VimMode
  /** 底部状态栏显示的提示文本 */
  statusText: string
}

interface UseDesktopVimInputProps {
  /** textarea 的当前值 */
  value: string
  /** 值变化时的回调 */
  onChange: (value: string) => void
  /** 提交时的回调（Enter 在 Insert 模式下） */
  onSubmit?: (value: string) => void
  /** 光标偏移量变化时的回调 */
  onCursorOffsetChange?: (offset: number) => void
  /** 当前光标偏移量 */
  cursorOffset: number
}

/**
 * 获取字符串中下一个/上一个字形边界的偏移量
 */
function nextGraphemeOffset(text: string, offset: number): number {
  if (offset >= text.length) return text.length
  // 使用 Intl.Segmenter 进行字形分割（如果可用）
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    for (const seg of segmenter.segment(text)) {
      if (seg.index > offset) return seg.index
    }
  }
  return Math.min(offset + 1, text.length)
}

function prevGraphemeOffset(text: string, offset: number): number {
  if (offset <= 0) return 0
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    let prev = 0
    for (const seg of segmenter.segment(text)) {
      if (seg.index >= offset) return prev
      prev = seg.index
    }
    return prev
  }
  return Math.max(offset - 1, 0)
}

/**
 * 查找下一个单词起始位置
 */
function nextWordOffset(text: string, offset: number): number {
  if (offset >= text.length) return text.length
  let pos = offset
  // 跳过当前单词
  while (pos < text.length && /\S/.test(text[pos]!)) pos++
  // 跳过空白
  while (pos < text.length && /\s/.test(text[pos]!)) pos++
  return pos
}

/**
 * 查找上一个单词起始位置
 */
function prevWordOffset(text: string, offset: number): number {
  if (offset <= 0) return 0
  let pos = offset - 1
  // 跳过空白
  while (pos > 0 && /\s/.test(text[pos]!)) pos--
  // 跳过当前单词
  while (pos > 0 && /\S/.test(text[pos - 1]!)) pos--
  return pos
}

/**
 * 查找行首位置
 */
function lineStartOffset(text: string, offset: number): number {
  const prevNewline = text.lastIndexOf('\n', offset - 1)
  return prevNewline === -1 ? 0 : prevNewline + 1
}

/**
 * 查找行尾位置
 */
function lineEndOffset(text: string, offset: number): number {
  const nextNewline = text.indexOf('\n', offset)
  return nextNewline === -1 ? text.length : nextNewline
}

/**
 * 查找第一个非空白字符位置
 */
function firstNonBlankOffset(text: string, offset: number): number {
  const lineStart = lineStartOffset(text, offset)
  let pos = lineStart
  while (pos < text.length && text[pos] === ' ') pos++
  return pos
}

export function useDesktopVimInput({
  value,
  onChange,
  onSubmit,
  onCursorOffsetChange,
  cursorOffset,
}: UseDesktopVimInputProps): VimState & {
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  setMode: (mode: VimMode) => void
} {
  const [mode, setMode] = React.useState<VimMode>('INSERT')
  const [statusText, setStatusText] = React.useState('')
  const undoStack = React.useRef<string[]>([])
  const redoStack = React.useRef<string[]>([])
  const lastChange = React.useRef<{ type: 'insert' | 'delete'; text: string; offset: number } | null>(null)
  const modeRef = React.useRef<VimMode>(mode)
  modeRef.current = mode

  const setCursorOffset = React.useCallback((offset: number) => {
    const clamped = Math.max(0, Math.min(value.length, offset))
    onCursorOffsetChange?.(clamped)
  }, [value.length, onCursorOffsetChange])

  const saveToUndoStack = React.useCallback(() => {
    undoStack.current.push(value)
    if (undoStack.current.length > 100) undoStack.current.shift()
    redoStack.current = []
  }, [value])

  const showStatus = React.useCallback((text: string) => {
    setStatusText(text)
    setTimeout(() => setStatusText(''), 2000)
  }, [])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const currentMode = modeRef.current

    // Esc 键：从 NORMAL 模式退出弹窗，或从 INSERT 模式进入 NORMAL 模式
    if (e.key === 'Escape') {
      if (currentMode === 'INSERT') {
        e.preventDefault()
        e.stopPropagation()
        setMode('NORMAL')
        // 光标左移一位（Vim 行为）
        if (cursorOffset > 0) {
          setCursorOffset(cursorOffset - 1)
        }
      }
      return
    }

    // INSERT 模式下，只处理 Ctrl 组合键，其余交给默认行为
    if (currentMode === 'INSERT') {
      if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'u': {
            // Ctrl+U: 删除到行首
            e.preventDefault()
            saveToUndoStack()
            const lineStart = lineStartOffset(value, cursorOffset)
            const newValue = value.slice(0, lineStart) + value.slice(cursorOffset)
            onChange(newValue)
            setCursorOffset(lineStart)
            return
          }
          case 'w': {
            // Ctrl+W: 删除前一个单词
            e.preventDefault()
            saveToUndoStack()
            const prevWord = prevWordOffset(value, cursorOffset)
            const newValue = value.slice(0, prevWord) + value.slice(cursorOffset)
            onChange(newValue)
            setCursorOffset(prevWord)
            return
          }
          case 'z': {
            // Ctrl+Z: 撤销
            e.preventDefault()
            if (undoStack.current.length > 0) {
              redoStack.current.push(value)
              const prev = undoStack.current.pop()!
              onChange(prev)
            }
            return
          }
          case 'y': {
            // Ctrl+Y: 重做
            e.preventDefault()
            if (redoStack.current.length > 0) {
              undoStack.current.push(value)
              const next = redoStack.current.pop()!
              onChange(next)
            }
            return
          }
        }
      }
      // Enter 键在 INSERT 模式下触发提交
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit?.(value)
        return
      }
      // 其他键保持默认行为
      return
    }

    // NORMAL 模式下的键绑定
    switch (e.key) {
      // ─── 模式切换 ───
      case 'i': {
        e.preventDefault()
        setMode('INSERT')
        return
      }
      case 'a': {
        e.preventDefault()
        setMode('INSERT')
        if (cursorOffset < value.length) {
          setCursorOffset(cursorOffset + 1)
        }
        return
      }
      case 'A': {
        e.preventDefault()
        setMode('INSERT')
        setCursorOffset(lineEndOffset(value, cursorOffset))
        return
      }
      case 'I': {
        e.preventDefault()
        setMode('INSERT')
        setCursorOffset(firstNonBlankOffset(value, cursorOffset))
        return
      }
      case 'o': {
        e.preventDefault()
        saveToUndoStack()
        const lineEnd = lineEndOffset(value, cursorOffset)
        const newValue = value.slice(0, lineEnd) + '\n' + value.slice(lineEnd)
        onChange(newValue)
        setCursorOffset(lineEnd + 1)
        setMode('INSERT')
        return
      }
      case 'O': {
        e.preventDefault()
        saveToUndoStack()
        const lineStart = lineStartOffset(value, cursorOffset)
        const newValue = value.slice(0, lineStart) + '\n' + value.slice(lineStart)
        onChange(newValue)
        setCursorOffset(lineStart)
        setMode('INSERT')
        return
      }

      // ─── 光标移动 ───
      case 'h': {
        e.preventDefault()
        if (cursorOffset > 0) {
          setCursorOffset(prevGraphemeOffset(value, cursorOffset))
        }
        return
      }
      case 'l': {
        e.preventDefault()
        if (cursorOffset < value.length) {
          setCursorOffset(nextGraphemeOffset(value, cursorOffset))
        }
        return
      }
      case 'j': {
        e.preventDefault()
        // 移动到下一行相同列
        const lineStart = lineStartOffset(value, cursorOffset)
        const col = cursorOffset - lineStart
        const nextLineStart = lineEndOffset(value, cursorOffset)
        if (nextLineStart < value.length) {
          const nextLineEnd = lineEndOffset(value, nextLineStart + 1)
          const targetOffset = Math.min(nextLineStart + 1 + col, nextLineEnd)
          setCursorOffset(targetOffset)
        }
        return
      }
      case 'k': {
        e.preventDefault()
        // 移动到上一行相同列
        const lineStart2 = lineStartOffset(value, cursorOffset)
        if (lineStart2 > 0) {
          const col2 = cursorOffset - lineStart2
          const prevLineStart = lineStartOffset(value, lineStart2)
          const prevLineEnd = lineStart2
          const targetOffset = Math.min(prevLineStart + col2, prevLineEnd)
          setCursorOffset(targetOffset)
        }
        return
      }
      case 'w': {
        e.preventDefault()
        setCursorOffset(nextWordOffset(value, cursorOffset))
        return
      }
      case 'b': {
        e.preventDefault()
        setCursorOffset(prevWordOffset(value, cursorOffset))
        return
      }
      case 'e': {
        e.preventDefault()
        // 移动到单词末尾
        let pos = cursorOffset
        if (pos >= value.length) return
        if (pos < value.length - 1 && /\S/.test(value[pos + 1]!)) {
          while (pos < value.length - 1 && /\S/.test(value[pos + 1]!)) pos++
        } else {
          while (pos < value.length && /\s/.test(value[pos]!)) pos++
          while (pos < value.length - 1 && /\S/.test(value[pos + 1]!)) pos++
        }
        setCursorOffset(pos)
        return
      }
      case '0': {
        e.preventDefault()
        setCursorOffset(lineStartOffset(value, cursorOffset))
        return
      }
      case '^': {
        e.preventDefault()
        setCursorOffset(firstNonBlankOffset(value, cursorOffset))
        return
      }
      case '$': {
        e.preventDefault()
        setCursorOffset(lineEndOffset(value, cursorOffset))
        return
      }
      case 'G': {
        e.preventDefault()
        // 移动到末尾
        setCursorOffset(value.length)
        return
      }
      case 'g': {
        // gg 移动到开头
        if ((e as unknown as { _gPressed?: boolean })._gPressed) {
          e.preventDefault()
          setCursorOffset(0)
          return
        }
        // 标记 g 已按下，等待下一个 g
        ;(e as unknown as { _gPressed?: boolean })._gPressed = true
        setTimeout(() => {
          (e as unknown as { _gPressed?: boolean })._gPressed = false
        }, 300)
        return
      }

      // ─── 删除操作 ───
      case 'x': {
        e.preventDefault()
        if (cursorOffset < value.length) {
          saveToUndoStack()
          const newValue = value.slice(0, cursorOffset) + value.slice(cursorOffset + 1)
          onChange(newValue)
          lastChange.current = { type: 'delete', text: value[cursorOffset]!, offset: cursorOffset }
        }
        return
      }
      case 'd': {
        // dd 删除整行
        if ((e as unknown as { _dPressed?: boolean })._dPressed) {
          e.preventDefault()
          saveToUndoStack()
          const lineStart = lineStartOffset(value, cursorOffset)
          const lineEnd = lineEndOffset(value, cursorOffset)
          const hasNewline = lineEnd < value.length
          const newValue = value.slice(0, lineStart) + value.slice(hasNewline ? lineEnd + 1 : lineEnd)
          onChange(newValue)
          setCursorOffset(lineStart)
          lastChange.current = { type: 'delete', text: value.slice(lineStart, lineEnd), offset: lineStart }
          return
        }
        // 标记 d 已按下
        ;(e as unknown as { _dPressed?: boolean })._dPressed = true
        setTimeout(() => {
          ;(e as unknown as { _dPressed?: boolean })._dPressed = false
        }, 300)
        return
      }

      // ─── 撤销/重做 ───
      case 'u': {
        e.preventDefault()
        if (undoStack.current.length > 0) {
          redoStack.current.push(value)
          const prev = undoStack.current.pop()!
          onChange(prev)
          showStatus('撤销')
        }
        return
      }
      case 'r': {
        // Ctrl+R 重做
        if (e.ctrlKey) {
          e.preventDefault()
          if (redoStack.current.length > 0) {
            undoStack.current.push(value)
            const next = redoStack.current.pop()!
            onChange(next)
            showStatus('重做')
          }
        }
        return
      }

      // ─── 复制粘贴 ───
      case 'y': {
        // yy 复制整行
        if ((e as unknown as { _yPressed?: boolean })._yPressed) {
          e.preventDefault()
          const lineStart = lineStartOffset(value, cursorOffset)
          const lineEnd = lineEndOffset(value, cursorOffset)
          const lineText = value.slice(lineStart, lineEnd + (lineEnd < value.length ? 1 : 0))
          navigator.clipboard.writeText(lineText).catch(() => {})
          showStatus('已复制整行')
          return
        }
        ;(e as unknown as { _yPressed?: boolean })._yPressed = true
        setTimeout(() => {
          ;(e as unknown as { _yPressed?: boolean })._yPressed = false
        }, 300)
        return
      }
      case 'p': {
        e.preventDefault()
        // 粘贴到光标后
        navigator.clipboard.readText().then(text => {
          if (text) {
            saveToUndoStack()
            const newValue = value.slice(0, cursorOffset) + text + value.slice(cursorOffset)
            onChange(newValue)
            setCursorOffset(cursorOffset + text.length)
          }
        }).catch(() => {})
        return
      }
      case 'P': {
        e.preventDefault()
        // 粘贴到光标前
        navigator.clipboard.readText().then(text => {
          if (text) {
            saveToUndoStack()
            const newValue = value.slice(0, cursorOffset) + text + value.slice(cursorOffset)
            onChange(newValue)
            setCursorOffset(cursorOffset + text.length)
          }
        }).catch(() => {})
        return
      }

      // ─── 重复操作 ───
      case '.': {
        e.preventDefault()
        if (lastChange.current) {
          saveToUndoStack()
          if (lastChange.current.type === 'delete') {
            const { offset, text } = lastChange.current
            if (offset < value.length && value.slice(offset, offset + text.length) === text) {
              const newValue = value.slice(0, offset) + value.slice(offset + text.length)
              onChange(newValue)
            }
          }
        }
        return
      }

      // ─── 进入 INSERT 模式的其他方式 ───
      case 's': {
        e.preventDefault()
        saveToUndoStack()
        if (cursorOffset < value.length) {
          const newValue = value.slice(0, cursorOffset) + value.slice(cursorOffset + 1)
          onChange(newValue)
        }
        setMode('INSERT')
        return
      }
      case 'C': {
        e.preventDefault()
        saveToUndoStack()
        const lineEnd = lineEndOffset(value, cursorOffset)
        const newValue = value.slice(0, cursorOffset) + value.slice(lineEnd)
        onChange(newValue)
        setMode('INSERT')
        return
      }
      case 'D': {
        e.preventDefault()
        saveToUndoStack()
        const lineEnd2 = lineEndOffset(value, cursorOffset)
        const newValue = value.slice(0, cursorOffset) + value.slice(lineEnd2)
        onChange(newValue)
        return
      }

      default:
        break
    }
  }, [value, cursorOffset, onChange, onSubmit, saveToUndoStack, setCursorOffset, showStatus])

  return {
    mode,
    statusText,
    handleKeyDown,
    setMode,
  }
}
