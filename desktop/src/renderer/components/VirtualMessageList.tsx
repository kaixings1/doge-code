/**
 * 虚拟滚动消息列表 - 仅渲染可视区域内的消息
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ToolResultRenderer } from './MarkdownRenderer.js'
import { ToolErrorBanner } from './ToolErrorBanner.js'
import { ToolProgressBar, type ProgressStatus } from './ToolProgressBar.js'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool'
  content: string
}

interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  url?: string
  alt?: string
}

// ─── 颜色常量 ───

const COLORS = {
  userBg: '#1A3A5C',
  userText: '#E0E8F0',
  assistantBg: '#162A3D',
  assistantText: '#D0E0F0',
  systemBg: '#1A1A1A',
  systemText: '#888',
  errorBg: '#2D1515',
  errorText: '#FF6B6B',
  codeBlockBg: '#0D2B1A',
  codeBlockBorder: '#1A4D2E',
  codeBlockText: '#A8E6C3',
  inlineCodeBg: '#0D3B20',
  inlineCodeText: '#7DDBA0',
  boldText: '#FFFFFF',
  toolUseBg: '#0D1B2A',
  toolUseBorder: '#1B3A5C',
  toolUseName: '#6B9FFF',
  toolUseArg: '#7DDBA0',
  thinkingBg: '#0F0F0F',
  thinkingText: '#777',
  toolSuccess: '#4ECB71',
  toolFail: '#FF6B6B',
  labelText: '#666',
}

// ─── 内容块解析 ───

function tryParseJsonBlocks(raw: string): ContentBlock[] | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[')) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed)) return null
    const blocks: ContentBlock[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const obj = item as Record<string, unknown>
      const blockType = typeof obj.type === 'string' ? obj.type : 'text'
      if (blockType === 'text' && typeof obj.text === 'string') {
        blocks.push({ type: 'text', text: obj.text })
      } else if (blockType === 'tool_use') {
        const input = typeof obj.input === 'object' && obj.input !== null ? obj.input as Record<string, unknown> : {}
        blocks.push({ type: 'tool_use', id: typeof obj.id === 'string' ? obj.id : '', name: typeof obj.name === 'string' ? obj.name : 'unknown', input })
      } else if (blockType === 'thinking' && typeof obj.thinking === 'string') {
        blocks.push({ type: 'thinking', text: obj.thinking })
      } else if (blockType === 'image') {
        blocks.push({ type: 'image', url: typeof obj.url === 'string' ? obj.url : '', alt: typeof obj.alt === 'string' ? obj.alt : '' })
      }
    }
    return blocks.length > 0 ? blocks : null
  } catch {
    return null
  }
}

function parseXmlToolUse(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const toolUseRegex = /<tool_use>\s*<name>([^<]+)<\/name>\s*<input>(.*?)<\/input>\s*<\/tool_use>/gs
  let match: RegExpExecArray | null
  while ((match = toolUseRegex.exec(content)) !== null) {
    blocks.push({ type: 'tool_use', name: match[1], input: {} })
  }
  if (blocks.length === 0 && content.trim()) {
    blocks.push({ type: 'text', text: content })
  }
  return blocks
}

function parseMessageContent(content: string): ContentBlock[] {
  const jsonBlocks = tryParseJsonBlocks(content)
  if (jsonBlocks) return jsonBlocks
  return parseXmlToolUse(content)
}

// ─── 工具调用参数格式化 ───

function formatToolInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2).slice(0, 2000)
  } catch {
    return String(input)
  }
}

// ─── 增强 Markdown 渲染 ───

/**
 * 将 Markdown 文本解析为分段 HTML，不同类型的内容用不同颜色/背景：
 * - 普通段落：淡蓝色背景气泡
 * - 代码块 ```...```：淡绿色背景气泡 + 等宽字体
 * - 行内代码 `...`：浅绿色背景
 * - 粗体 **...**：白色加粗
 * - 关键字符串（文件路径、命令名）：额外高亮
 */
function renderEnhancedMarkdown(raw: string): string {
  if (!raw || !raw.trim()) return ''

  const parts = parseMarkdownBlocks(raw.trim())
  return parts.map(p => renderPart(p)).join('')
}

interface MarkdownPart {
  type: 'paragraph' | 'codeBlock' | 'inlineCode' | 'bold' | 'plain'
  content: string
}

function parseMarkdownBlocks(text: string): MarkdownPart[] {
  const parts: MarkdownPart[] = []
  const codeBlockRegex = /```[\s\S]*?```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // 代码块前面的普通文本
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index)
      parts.push(...parseInlineParts(before))
    }
    // 代码块
    const codeContent = match[0].slice(3, -3) // 去掉 ```
    const langMatch = codeContent.match(/^(\w+)\n/)
    const lang = langMatch ? langMatch[1] : ''
    const body = langMatch ? codeContent.slice(langMatch[0].length) : codeContent
    parts.push({ type: 'codeBlock', content: escapeHtml(body.trim()) })
    lastIndex = match.index + match[0].length
  }

  // 剩余普通文本
  if (lastIndex < text.length) {
    parts.push(...parseInlineParts(text.slice(lastIndex)))
  }

  return parts.length > 0 ? parts : [{ type: 'plain', content: escapeHtml(text) }]
}

function parseInlineParts(text: string): MarkdownPart[] {
  const parts: MarkdownPart[] = []
  // 按行分段，空行分隔段落
  const paragraphs = text.split(/\n{2,}/)
  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    // 段落内部处理行内代码和粗体
    const inline = parseInlineFormatting(trimmed)
    if (inline.length === 1 && inline[0].type === 'plain') {
      parts.push({ type: 'paragraph', content: inline[0].content })
    } else {
      parts.push(...inline)
    }
  }
  return parts
}

function parseInlineFormatting(text: string): MarkdownPart[] {
  const parts: MarkdownPart[] = []
  // 正则匹配行内代码、粗体、普通文本
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|([^`*]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'plain', content: escapeHtml(text.slice(lastIndex, match.index)) })
    }
    if (match[1]) {
      // 行内代码
      const codeContent = match[1].slice(1, -1)
      parts.push({ type: 'inlineCode', content: escapeHtml(codeContent) })
    } else if (match[2]) {
      // 粗体
      const boldContent = match[2].slice(2, -2)
      parts.push({ type: 'bold', content: escapeHtml(boldContent) })
    } else if (match[3]) {
      parts.push({ type: 'plain', content: escapeHtml(match[3]) })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'plain', content: escapeHtml(text.slice(lastIndex)) })
  }

  return parts.length > 0 ? parts : [{ type: 'plain', content: '' }]
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderPart(part: MarkdownPart): string {
  switch (part.type) {
    case 'paragraph':
      return `<div style="background:${COLORS.assistantBg};padding:6px 10px;border-radius:4px;margin:3px 0;color:${COLORS.assistantText};line-height:1.6;font-size:13px;">${part.content}</div>`
    case 'codeBlock':
      return `<div style="background:${COLORS.codeBlockBg};border:1px solid ${COLORS.codeBlockBorder};border-radius:4px;padding:10px 12px;margin:6px 0;font-family:'Cascadia Code','Fira Code',monospace;font-size:12px;color:${COLORS.codeBlockText};white-space:pre-wrap;word-break:break-all;line-height:1.5;">${part.content}</div>`
    case 'inlineCode':
      return `<code style="background:${COLORS.inlineCodeBg};color:${COLORS.inlineCodeText};padding:1px 5px;border-radius:3px;font-family:'Cascadia Code','Fira Code',monospace;font-size:12px;">${part.content}</code>`
    case 'bold':
      return `<strong style="color:${COLORS.boldText};font-weight:700;">${part.content}</strong>`
    case 'plain':
    default:
      return part.content
  }
}

// ─── 组件 ───

interface VirtualMessageListProps {
  messages: Message[]
  currentStreaming: string
  toolProgress: { toolName: string; status: ProgressStatus; progress?: number; duration?: number } | null
  executingToolIds: Set<string>
  msgSearchQuery: string
  msgSearchMatches: number[]
  executeToolFromBlock: (block: any) => void
  styles: Record<string, React.CSSProperties>
}

const ESTIMATED_ITEM_HEIGHT = 120
const OVERSCAN = 5

export function VirtualMessageList({
  messages,
  currentStreaming,
  toolProgress,
  executingToolIds,
  msgSearchQuery,
  msgSearchMatches,
  executeToolFromBlock,
  styles,
}: VirtualMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const containerHeightRef = useRef(0)
  const heightsRef = useRef<Map<string, number>>(new Map())
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: messages.length })
  const [, forceUpdate] = useState(0)
  const isNearBottomRef = useRef(true)

  const totalHeight = messages.reduce((sum, m) => {
    return sum + (heightsRef.current.get(m.id) ?? ESTIMATED_ITEM_HEIGHT)
  }, 0)

  const getOffsetTop = useCallback((index: number): number => {
    let offset = 0
    for (let i = 0; i < index; i++) {
      offset += heightsRef.current.get(messages[i]?.id ?? '') ?? ESTIMATED_ITEM_HEIGHT
    }
    return offset
  }, [messages])

  const updateVisibleRange = useCallback(() => {
    const scrollTop = scrollTopRef.current
    const containerHeight = containerHeightRef.current
    if (!containerHeight) return

    let accumulated = 0
    let start = 0
    let end = messages.length

    for (let i = 0; i < messages.length; i++) {
      const h = heightsRef.current.get(messages[i]?.id ?? '') ?? ESTIMATED_ITEM_HEIGHT
      if (accumulated + h > scrollTop) {
        start = Math.max(0, i - OVERSCAN)
        break
      }
      accumulated += h
    }

    accumulated = 0
    for (let i = start; i < messages.length; i++) {
      const h = heightsRef.current.get(messages[i]?.id ?? '') ?? ESTIMATED_ITEM_HEIGHT
      accumulated += h
      if (accumulated > containerHeight + scrollTop) {
        end = Math.min(messages.length, i + OVERSCAN)
        break
      }
    }

    setVisibleRange(prev => {
      if (prev.start === start && prev.end === end) return prev
      return { start, end }
    })
  }, [messages])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    scrollTopRef.current = el.scrollTop
    containerHeightRef.current = el.clientHeight
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    updateVisibleRange()
  }, [updateVisibleRange])

  const measureMessage = useCallback((id: string, height: number) => {
    const prev = heightsRef.current.get(id)
    if (prev !== height) {
      heightsRef.current.set(id, height)
      forceUpdate(n => n + 1)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (el) {
      containerHeightRef.current = el.clientHeight
      el.scrollTop = el.scrollHeight
      scrollTopRef.current = el.scrollTop
      isNearBottomRef.current = true
      updateVisibleRange()
    }
  }, [updateVisibleRange])

  useEffect(() => {
    const el = containerRef.current
    if (el) {
      scrollTopRef.current = el.scrollTop
      containerHeightRef.current = el.clientHeight
      updateVisibleRange()
    }
  }, [messages.length, updateVisibleRange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length, currentStreaming])

  const { start, end } = visibleRange
  const visibleMessages = messages.slice(start, end)

  return (
    <div
      ref={containerRef}
      style={{ ...styles.chatMessages, overflowY: 'auto' }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleMessages.map((m, i) => {
          const idx = start + i
          const offsetTop = getOffsetTop(idx)
          const blocks = m.role === 'assistant' ? parseMessageContent(m.content) : null
          return (
            <MessageItem
              key={m.id}
              message={m}
              index={idx}
              offsetTop={offsetTop}
              isAssistant={m.role === 'assistant'}
              isTool={m.role === 'tool'}
              blocks={blocks}
              executingToolIds={executingToolIds}
              msgSearchQuery={msgSearchQuery}
              msgSearchMatches={msgSearchMatches}
              executeToolFromBlock={executeToolFromBlock}
              measureHeight={measureHeight}
              styles={styles}
            />
          )
        })}
      </div>

      {currentStreaming && (
        <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
          <div style={styles.roleLabel}>助手</div>
          <div dangerouslySetInnerHTML={{ __html: renderEnhancedMarkdown(currentStreaming) }} />
          <div style={styles.thinkingIndicator}>...</div>
        </div>
      )}

      {toolProgress && toolProgress.status !== 'success' && (
        <ToolProgressBar
          toolName={toolProgress.toolName}
          status={toolProgress.status}
          progress={toolProgress.progress}
          duration={toolProgress.duration}
          onCancel={() => window.dogeAPI.abort()}
        />
      )}
    </div>
  )
}

// ─── MessageItem ───

interface MessageItemProps {
  message: Message
  index: number
  offsetTop: number
  isAssistant: boolean
  isTool: boolean
  blocks: any[] | null
  executingToolIds: Set<string>
  msgSearchQuery: string
  msgSearchMatches: number[]
  executeToolFromBlock: (block: any) => void
  measureHeight: (id: string, height: number) => void
  styles: Record<string, React.CSSProperties>
}

function MessageItem({
  message,
  index,
  offsetTop,
  isAssistant,
  isTool,
  blocks,
  executingToolIds,
  msgSearchQuery,
  msgSearchMatches,
  executeToolFromBlock,
  measureHeight,
  styles,
}: MessageItemProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      measureHeight(message.id, ref.current.getBoundingClientRect().height)
    }
  })

  useEffect(() => {
    if (ref.current) {
      measureHeight(message.id, ref.current.getBoundingClientRect().height)
    }
  }, [message.content, measureHeight])

  if (message.role === 'error') {
    return (
      <div
        ref={ref}
        style={{
          ...styles.errorBubble,
          position: 'absolute',
          top: offsetTop,
          left: 0,
          right: 0,
        }}
      >
        <div style={styles.roleLabel}>错误</div>
        <div style={{ color: COLORS.errorText, whiteSpace: 'pre-wrap' }}>{message.content}</div>
      </div>
    )
  }

  let toolResultContent: { success?: boolean; output?: unknown; error?: string } | null = null
  if (isTool) {
    try { toolResultContent = JSON.parse(message.content) } catch { /* not JSON */ }
  }

  const matchesSearch = !msgSearchQuery || message.content.toLowerCase().includes(msgSearchQuery.toLowerCase())

  return (
    <div
      ref={ref}
      style={{
        ...styles.messageBubble,
        position: 'absolute',
        top: offsetTop,
        left: 0,
        right: 0,
        opacity: msgSearchQuery ? (matchesSearch ? 1 : 0.3) : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <div style={styles.roleLabel}>
        {message.role === 'user' ? '用户' : isAssistant ? '助手' : isTool ? '🔧 工具结果' : '系统'}
      </div>

      {/* 用户消息：淡蓝色气泡 */}
      {message.role === 'user' && (
        <div style={{
          background: COLORS.userBg,
          borderRadius: '8px',
          padding: '8px 12px',
          color: COLORS.userText,
          fontSize: '13px',
          lineHeight: '1.6',
        }}>
          {message.content}
        </div>
      )}

      {/* 系统消息：暗色，保持现状 */}
      {message.role === 'system' && (
        <div style={{
          background: COLORS.systemBg,
          borderRadius: '4px',
          padding: '4px 10px',
          color: COLORS.systemText,
          fontSize: '11px',
          fontStyle: 'italic',
        }}>
          {message.content}
        </div>
      )}

      {/* 错误消息：红色 */}
      {message.role === 'error' && (
        <div style={{ color: COLORS.errorText, whiteSpace: 'pre-wrap' }}>
          {message.content}
        </div>
      )}

      {/* 工具结果消息 */}
      {isTool && toolResultContent && (
        <div>
          {toolResultContent.success != null && (
            <div style={{
              color: toolResultContent.success ? COLORS.toolSuccess : COLORS.toolFail,
              fontSize: '11px',
              fontWeight: 600,
              marginBottom: '4px',
            }}>
              {toolResultContent.success ? '✓ 执行成功' : '✗ 执行失败'}
            </div>
          )}
          {toolResultContent.error && <ToolErrorBanner error={toolResultContent.error} toolName={message.id} />}
          <ToolResultRenderer output={toolResultContent.output} error={toolResultContent.error} success={toolResultContent.success} maxHeight={250} />
        </div>
      )}

      {/* 助手消息：结构化 content blocks 渲染 */}
      {isAssistant && blocks && (
        <div>
          {blocks.map((block, i) => {
            if (block.type === 'tool_use') {
              return (
                <div key={i} style={{
                  background: COLORS.toolUseBg,
                  border: `1px solid ${COLORS.toolUseBorder}`,
                  borderRadius: '6px',
                  padding: '8px 12px',
                  margin: '4px 0',
                  fontFamily: "'Cascadia Code','Fira Code',monospace",
                  fontSize: '12px',
                }}>
                  <div style={{ color: COLORS.toolUseName, marginBottom: block.input && Object.keys(block.input).length > 0 ? '6px' : '0' }}>
                    ● {block.name}
                  </div>
                  {block.input && Object.keys(block.input).length > 0 && (
                    <div style={{
                      color: COLORS.toolUseArg,
                      fontSize: '11px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      lineHeight: '1.5',
                    }}>
                      {formatToolInput(block.input)}
                    </div>
                  )}
                </div>
              )
            }
            if (block.type === 'thinking') {
              return (
                <div key={i} style={{
                  background: COLORS.thinkingBg,
                  border: '1px solid #262626',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  margin: '4px 0',
                  fontSize: '11px',
                  color: COLORS.thinkingText,
                  fontStyle: 'italic',
                }}>
                  💭 {block.text}
                </div>
              )
            }
            if (block.type === 'image') {
              return (
                <div key={i} style={{ margin: '4px 0' }}>
                  <img src={block.url} alt={block.alt || ''} style={{ maxWidth: '100%', borderRadius: '4px' }} />
                </div>
              )
            }
            // text block — 使用增强渲染
            return (
              <div key={i} dangerouslySetInnerHTML={{ __html: renderEnhancedMarkdown(block.text ?? '') }} />
            )
          })}
        </div>
      )}
    </div>
  )
}
