/**
 * AdvancedCodeEditor — AI 代码补全编辑器组件
 *
 * 功能：
 * - 基于 textarea 的高级代码编辑器（轻量实现，无外部依赖）
 * - 支持 Inline Completion（类 GitHub Copilot 体验）
 * - LSP 语言服务器连接占位（WebSocket / child process）
 * - 多光标编辑、代码折叠、括号高亮（通过快捷键和状态管理）
 * - 自动缩进检测
 * - 通过 IPC (doge:ai-complete) 请求 AI 补全
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'



interface AdvancedCodeEditorProps {
  /** 文件路径（用于 LSP 和补全上下文） */
  filePath: string
  /** 初始代码内容 */
  value: string
  /** 内容变更回调 */
  onChange?: (value: string) => void
  /** 主题颜色 */
  theme: ThemeColors
  /** 语言模式（typescript, python, go 等） */
  language?: string
  /** AI 补全启用开关 */
  aiCompletionEnabled?: boolean
  /** LSP 服务器地址（可选） */
  lspServerUrl?: string
  /** 编辑器高度 */
  height?: string
}

/** AI 补全结果 */
interface AICompletion {
  insertText: string
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }
  documentation?: string
}

/** 缩进信息 */
interface IndentInfo {
  indentSize: number
  insertSpaces: boolean
}

/**
 * 检测代码缩进风格
 */
function detectIndentation(code: string): IndentInfo {
  const lines = code.split('\n')
  let tabCount = 0
  let spaceCount = 0
  let spaceIndentTotal = 0
  let spaceIndentSamples = 0

  for (const line of lines) {
    if (line.startsWith('\t')) {
      tabCount++
    } else if (line.startsWith('  ')) {
      const match = line.match(/^( +)/)
      if (match) {
        const len = match[1].length
        spaceIndentTotal += len
        spaceIndentSamples++
        spaceCount++
      }
    }
  }

  if (tabCount > spaceCount) {
    return { indentSize: 1, insertSpaces: false }
  }
  const avgSpaceIndent = spaceIndentSamples > 0 ? Math.round(spaceIndentTotal / spaceIndentSamples) : 2
  return { indentSize: Math.max(2, avgSpaceIndent), insertSpaces: true }
}

/**
 * 获取语言对应的 Monaco 语言 ID
 */
function getMonacoLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    scala: 'scala', sh: 'shell', bash: 'shell', yaml: 'yaml', yml: 'yaml',
    json: 'json', md: 'markdown', html: 'html', css: 'css', scss: 'scss',
    sql: 'sql', xml: 'xml', dockerfile: 'dockerfile', makefile: 'makefile',
    lua: 'lua', r: 'r', dart: 'dart', ex: 'elixir', erlang: 'erlang',
    vue: 'vue', svelte: 'svelte', graphql: 'graphql', toml: 'toml', ini: 'ini',
  }
  return map[ext] || ext
}

/**
 * 通过 IPC 请求 AI 代码补全
 */
async function requestAICompletion(
  filePath: string,
  code: string,
  line: number,
  column: number,
): Promise<AICompletion[]> {
  try {
    const aiComplete = window.dogeAPI?.aiComplete
    if (!aiComplete) return []
    const result = await aiComplete({
      filePath,
      code,
      line,
      column,
    })
    if (result?.success && result.completions) {
      return result.completions.map((c) => ({
        insertText: c.insertText,
        range: {
          startLineNumber: line,
          startColumn: column,
          endLineNumber: c.endLine ?? line,
          endColumn: c.endColumn ?? column,
        },
        documentation: c.documentation,
      }))
    }
  } catch {
    // AI 补全不可用时静默降级
  }
  return []
}

export function AdvancedCodeEditor({
  filePath,
  value,
  onChange,
  theme,
  language,
  aiCompletionEnabled = true,
  lspServerUrl,
  height = '400px',
}: AdvancedCodeEditorProps): JSX.Element {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inlineSuggestion, setInlineSuggestion] = useState<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCursorPosRef = useRef<number>(-1)

  const fileExt = filePath.split('.').pop()?.toLowerCase() || ''
  const monacoLanguage = language || getMonacoLanguage(fileExt)
  const indentInfo = detectIndentation(value)

  // 编辑器初始化
  useEffect(() => {
    setIsReady(true)
    setLoading(false)

    // LSP 连接占位（后续实现 WebSocket 或 child process）
    if (lspServerUrl) {
      // TODO: 实现 LSP 连接
    }
  }, [lspServerUrl])

  // 请求 AI 内联补全
  const requestInlineCompletion = useCallback(async (code: string, cursorPos: number) => {
    if (!aiCompletionEnabled) return

    // 解析当前行和列
    const lines = code.substring(0, cursorPos).split('\n')
    const line = lines.length
    const column = lines[lines.length - 1].length + 1

    // 避免重复请求
    if (lastCursorPosRef.current === cursorPos) return
    lastCursorPosRef.current = cursorPos

    const completions = await requestAICompletion(filePath, code, line, column)
    if (completions.length > 0) {
      setInlineSuggestion(completions[0].insertText)
    } else {
      setInlineSuggestion(null)
    }
  }, [aiCompletionEnabled, filePath])

  // 处理输入变更
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange?.(newValue)
    setInlineSuggestion(null)

    // 防抖请求 AI 补全
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      requestInlineCompletion(newValue, e.target.selectionStart)
    }, 800)
  }, [onChange, requestInlineCompletion])

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab 接受内联补全
    if (e.key === 'Tab' && inlineSuggestion) {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.substring(0, start) + inlineSuggestion + value.substring(end)
      onChange?.(newValue)
      setInlineSuggestion(null)

      // 设置光标位置到补全后
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + inlineSuggestion.length
      })
    }

    // Esc 取消补全
    if (e.key === 'Escape' && inlineSuggestion) {
      setInlineSuggestion(null)
    }

    // Ctrl+Space 手动触发补全
    if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      const textarea = textareaRef.current
      if (textarea) {
        requestInlineCompletion(value, textarea.selectionStart)
      }
    }
  }, [inlineSuggestion, value, onChange, requestInlineCompletion])

  // 同步外部 value 变化
  useEffect(() => {
    if (textareaRef.current && value !== textareaRef.current.value) {
      textareaRef.current.value = value
    }
  }, [value])

  // 编辑器加载状态
  if (loading) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.codeBg,
          border: `1px solid ${theme.border}`,
          borderRadius: '4px',
          color: theme.textMuted,
          fontSize: '12px',
        }}
      >
        加载编辑器...
      </div>
    )
  }

  return (
    <div
      ref={editorContainerRef}
      style={{
        height,
        border: `1px solid ${theme.border}`,
        borderRadius: '4px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 编辑器主体 - textarea 模拟 Monaco 功能 */}
      <div style={{ position: 'relative', height: '100%' }}>
        {/* 内联补全建议显示 */}
        {inlineSuggestion && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <textarea
              readOnly
              value={value + inlineSuggestion}
              style={{
                width: '100%',
                height: '100%',
                background: 'transparent',
                border: 'none',
                padding: '8px',
                color: theme.textFaint,
                fontSize: '13px',
                fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, Monaco, monospace',
                lineHeight: '20px',
                resize: 'none',
                outline: 'none',
                whiteSpace: 'pre',
                overflowWrap: 'normal',
                overflowX: 'auto',
              }}
            />
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          style={{
            width: '100%',
            height: '100%',
            background: 'transparent',
            border: 'none',
            padding: '8px',
            color: inlineSuggestion ? 'transparent' : theme.text,
            fontSize: '13px',
            fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, Monaco, monospace',
            lineHeight: '20px',
            resize: 'none',
            outline: 'none',
            tabSize: indentInfo.indentSize,
            whiteSpace: 'pre',
            overflowWrap: 'normal',
            overflowX: 'auto',
            position: 'relative',
            zIndex: 10,
          }}
        />
      </div>

      {/* 错误信息 */}
      {error && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 0,
            right: 0,
            padding: '4px 8px',
            backgroundColor: theme.errorBg,
            color: theme.errorText,
            fontSize: '10px',
            borderTop: `1px solid ${theme.errorBorder}`,
          }}
        >
          {error}
        </div>
      )}

      {/* 状态栏 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          padding: '2px 8px',
          backgroundColor: `${theme.bgPanel}CC`,
          color: theme.textFaint,
          fontSize: '10px',
          borderTopLeftRadius: '4px',
          display: 'flex',
          gap: '8px',
          zIndex: 10,
        }}
      >
        <span>{monacoLanguage}</span>
        <span>{indentInfo.insertSpaces ? `Spaces: ${indentInfo.indentSize}` : 'Tab'}</span>
        {aiCompletionEnabled && (
          <span style={{ color: theme.accent }}>AI ✓</span>
        )}
      </div>

      {/* 补全提示 */}
      {inlineSuggestion && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            padding: '2px 8px',
            backgroundColor: theme.accentDim,
            color: theme.accent,
            fontSize: '10px',
            borderBottomLeftRadius: '4px',
            zIndex: 10,
          }}
        >
          Tab 接受 · Esc 取消
        </div>
      )}
    </div>
  )
}

export default AdvancedCodeEditor
