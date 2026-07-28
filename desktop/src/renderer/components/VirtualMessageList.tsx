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

interface ContentBlock { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; url?: string; alt?: string }

function parseMessageContentSimple(content: string): ContentBlock[] {
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

function renderSimpleMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code style="background:#1A1A1A;padding:1px 4px;border-radius:2px;font-size:12px;font-family:monospace">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

interface VirtualMessageListProps {
  messages: Message[]
  currentStreaming: string
  toolProgress: { toolName: string; status: ProgressStatus; progress?: number; duration?: number } | null
  executingToolIds: Set<string>
  msgSearchQuery: string
  msgSearchMatches: number[]
  executeToolFromBlock: (block: any) => void
  styles: Record<string, React.CSSProperties>
  onScrollToBottom?: () => void
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

  // 计算总高度
  const totalHeight = messages.reduce((sum, m) => {
    return sum + (heightsRef.current.get(m.id) ?? ESTIMATED_ITEM_HEIGHT)
  }, 0)

  // 计算偏移量
  const getOffsetTop = useCallback((index: number): number => {
    let offset = 0
    for (let i = 0; i < index; i++) {
      offset += heightsRef.current.get(messages[i]?.id ?? '') ?? ESTIMATED_ITEM_HEIGHT
    }
    return offset
  }, [messages])

  // 计算可视范围
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

  // 滚动处理
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    scrollTopRef.current = el.scrollTop
    containerHeightRef.current = el.clientHeight
    updateVisibleRange()
  }, [updateVisibleRange])

  // 测量消息高度
  const measureMessage = useCallback((id: string, height: number) => {
    const prev = heightsRef.current.get(id)
    if (prev !== height) {
      heightsRef.current.set(id, height)
      forceUpdate(n => n + 1)
    }
  }, [])

  // 初始化容器高度
  useEffect(() => {
    const el = containerRef.current
    if (el) {
      containerHeightRef.current = el.clientHeight
      updateVisibleRange()
    }
  }, [updateVisibleRange])

  // 消息变化时重置
  useEffect(() => {
    const el = containerRef.current
    if (el) {
      scrollTopRef.current = el.scrollTop
      containerHeightRef.current = el.clientHeight
      updateVisibleRange()
    }
  }, [messages.length, updateVisibleRange])

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
          return (
            <MessageItem
              key={m.id}
              message={m}
              index={idx}
              offsetTop={offsetTop}
              isAssistant={m.role === 'assistant'}
              isTool={m.role === 'tool'}
              blocks={m.role === 'assistant' ? parseMessageContentSimple(m.content) : null}
              executingToolIds={executingToolIds}
              msgSearchQuery={msgSearchQuery}
              msgSearchMatches={msgSearchMatches}
              executeToolFromBlock={executeToolFromBlock}
              measureHeight={measureMessage}
              styles={styles}
            />
          )
        })}
      </div>

      {currentStreaming && (
        <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
          <div style={styles.roleLabel}>助手</div>
          <div dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(currentStreaming) }} />
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
        <div>{message.content}</div>
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
        ...(message.role === 'user' ? styles.userBubble : isTool ? styles.toolResultBubble : styles.assistantBubble),
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
      {isTool && toolResultContent ? (
        <div>
          {toolResultContent.success != null && (
            <div style={{ color: toolResultContent.success ? '#4ECB71' : '#FF6B6B', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
              {toolResultContent.success ? '✓ 执行成功' : '✗ 执行失败'}
            </div>
          )}
          {toolResultContent.error && <ToolErrorBanner error={toolResultContent.error} toolName={message.id} />}
          <ToolResultRenderer output={toolResultContent.output} error={toolResultContent.error} success={toolResultContent.success} maxHeight={250} />
        </div>
      ) : blocks ? (
        blocks.map((block, i) => {
          if (block.type === 'tool_use') {
            return <div key={i} style={{ background: '#0A0A0A', border: '1px solid #262626', borderRadius: '4px', padding: '8px 10px', margin: '4px 0', fontFamily: 'monospace', fontSize: '11px' }}>🔧 {block.name}</div>
          }
          if (block.type === 'thinking') {
            return <div key={i} style={{ padding: '6px 10px', margin: '4px 0', background: '#0F0F0F', border: '1px solid #262626', borderRadius: '4px', fontSize: '11px', color: '#888', fontStyle: 'italic' }}>{block.text}</div>
          }
          if (block.type === 'image') {
            return <div key={i} style={{ margin: '4px 0' }}><img src={block.url} alt={block.alt || ''} style={{ maxWidth: '100%', borderRadius: '4px' }} /></div>
          }
          return <div key={i} dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(block.text ?? '') }} />
        })
      ) : (
        <div dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(message.content) }} />
      )}
    </div>
  )
}

