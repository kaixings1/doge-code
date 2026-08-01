/**
 * OutputPanel — 输出/Debug Console 面板
 *
 * 展示多通道日志输出，支持：
 * - 通道切换（Build / Debug / Tasks / Plugins）
 * - 自动滚动
 * - 清空通道 / 清空全部
 * - 级别过滤
 */

import React, { useCallback, useEffect, useRef } from 'react'
import type { ThemeColors } from '../theme.js'
import { useOutputChannel } from '../hooks/useOutputChannel.js'

export interface OutputPanelProps {
  theme: ThemeColors
  onClose: () => void
  /** 初始选中的通道 ID */
  initialChannelId?: string
}

const LEVEL_STYLE: Record<string, { color: string; label: string }> = {
  info:    { color: '#4FC3F7', label: 'INF' },
  warn:    { color: '#FFB74D', label: 'WRN' },
  error:   { color: '#EF5350', label: 'ERR' },
  debug:   { color: '#90A4AE', label: 'DBG' },
}

export function OutputPanel({ theme, onClose, initialChannelId }: OutputPanelProps): JSX.Element {
  const c = theme
  const { channels, activeChannelId, setActiveChannelId, autoScroll, setAutoScroll, appendToChannel, clearChannel, clearAll, entries } = useOutputChannel()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialChannelId) setActiveChannelId(initialChannelId)
  }, [initialChannelId, setActiveChannelId])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries.length, autoScroll])

  const handleClear = useCallback((channelId?: string) => {
    if (channelId && channelId !== '__all__') {
      clearChannel(channelId)
    } else {
      clearAll()
    }
  }, [clearChannel, clearAll])

  const activeChannel = channels.find(ch => ch.id === activeChannelId)

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '300px',
      background: c.bgPanel,
      borderTop: `1px solid ${c.border}`,
      boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
      zIndex: 9990,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Menlo, Consolas, "Courier New", monospace',
      fontSize: '12px',
    }}>
      {/* 头部工具栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderBottom: `1px solid ${c.border}`,
        background: c.bgAlt,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {channels.map(ch => (
            <button
              key={ch.id}
              onClick={() => setActiveChannelId(ch.id)}
              style={{
                padding: '3px 10px',
                border: `1px solid ${ch.id === activeChannelId ? c.accent : c.border}`,
                borderRadius: '3px',
                background: ch.id === activeChannelId ? `${c.accent}22` : 'transparent',
                color: ch.id === activeChannelId ? c.accent : c.textMuted,
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 500,
              }}
            >
              {ch.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: c.textMuted, fontSize: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
            自动滚动
          </label>
          <select
            onChange={e => { if (e.target.value === '__all__') handleClear('__all__') }}
            defaultValue=""
            style={{ fontSize: '10px', background: c.inputBg, color: c.text, border: `1px solid ${c.border}`, borderRadius: '3px', padding: '2px 4px' }}
          >
            <option value="" disabled>清空...</option>
            <option value="__all__">清空全部</option>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>清空 {ch.name}</option>
            ))}
          </select>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.textFaint, cursor: 'pointer', fontSize: '14px' }}>✕</button>
        </div>
      </div>

      {/* 通道标签 */}
      {activeChannel && (
        <div style={{
          padding: '3px 10px',
          borderBottom: `1px solid ${c.borderSubtle}`,
          color: c.textFaint,
          fontSize: '10px',
          flexShrink: 0,
        }}>
          {activeChannel.name} — {entries.length} 条记录
        </div>
      )}

      {/* 日志条目 */}
      <div ref={scrollRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0',
        background: c.bgPanel,
      }}>
        {entries.length === 0 && (
          <div style={{ padding: '20px', color: c.textFaint, textAlign: 'center', fontSize: '11px' }}>
            暂无输出
          </div>
        )}
        {entries.map((entry, idx) => {
          const levelStyle = LEVEL_STYLE[entry.level] || LEVEL_STYLE.info
          const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
          return (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '2px 10px',
              borderBottom: `1px solid ${c.borderSubtle}`,
              fontSize: '11px',
              lineHeight: '1.5',
            }}>
              <span style={{ color: c.textFaint, flexShrink: 0, fontSize: '10px', marginTop: '1px' }}>{time}</span>
              <span style={{
                color: levelStyle.color,
                flexShrink: 0,
                fontWeight: 600,
                fontSize: '9px',
                marginTop: '2px',
                minWidth: '28px',
              }}>
                {levelStyle.label}
              </span>
              <span style={{ color: c.text, wordBreak: 'break-word', flex: 1 }}>{entry.message}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default OutputPanel
