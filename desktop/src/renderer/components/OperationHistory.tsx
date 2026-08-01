/**
 * OperationHistory — 操作历史卡片组件
 *
 * 展示工具执行快照，支持一键回滚（类似 VS Code Local History）。
 * 通过 IPC 调用 toolExecutor 的 rollbackTool 方法。
 */

import React, { useState, useCallback } from 'react'

export interface OperationEntry {
  toolUseId: string
  toolName: string
  timestamp: number
  files: string[]
  /** 是否有可用的快照（before + after） */
  hasSnapshot: boolean
  /** 是否已回滚 */
  rolledBack: boolean
}

interface OperationHistoryProps {
  /** 操作历史列表（由父组件从 IPC 获取） */
  operations: OperationEntry[]
  /** 回滚操作 */
  onRollback: (toolUseId: string) => Promise<{ success: boolean; restored: string[]; error?: string }>
  /** 清除所有历史 */
  onClear: () => void
  theme: {
    accent: string
    text: string
    textFaint: string
    textMuted: string
    bgPanel: string
    border: string
    surface: string
    errorText: string
    successText: string
    warningText: string
  }
}

export function OperationHistory({ operations, onRollback, onClear, theme }: OperationHistoryProps) {
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  const handleRollback = useCallback(async (toolUseId: string) => {
    setRollingBack(toolUseId)
    try {
      await onRollback(toolUseId)
    } finally {
      setRollingBack(null)
    }
  }, [onRollback])

  if (operations.length === 0) {
    return (
      <div style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: '6px',
        padding: '16px',
        textAlign: 'center',
        color: theme.textMuted,
        fontSize: '12px',
      }}>
        📋 暂无操作历史 — 文件编辑操作会自动记录快照
      </div>
    )
  }

  return (
    <div style={{
      background: theme.bgPanel,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      overflow: 'hidden',
    }}>
      {/* 标题栏 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: theme.surface,
        borderBottom: `1px solid ${theme.border}`,
      }}>
        <span style={{ fontWeight: 600, color: theme.accent, fontSize: '12px' }}>
          📋 操作历史 ({operations.length})
        </span>
        <span
          style={{ cursor: 'pointer', color: theme.textFaint, fontSize: '10px' }}
          onClick={onClear}
          title="清除所有历史"
        >
          清除全部
        </span>
      </div>

      {/* 操作列表 */}
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {operations.map(op => {
          const time = new Date(op.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
          const fileName = op.files.map(f => f.split(/[\\/]/).pop()).join(', ')
          return (
            <div
              key={op.toolUseId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderTop: `1px solid ${theme.border}`,
                fontSize: '11px',
              }}
            >
              {/* 时间戳 */}
              <span style={{ color: theme.textMuted, fontSize: '10px', flexShrink: 0, minWidth: '60px' }}>
                {time}
              </span>

              {/* 操作详情 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {op.toolName}
                </div>
                <div style={{ color: theme.textMuted, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fileName}
                </div>
              </div>

              {/* 状态指示 */}
              {op.rolledBack ? (
                <span style={{ color: theme.textMuted, fontSize: '10px' }}>已回滚</span>
              ) : op.hasSnapshot ? (
                <button
                  onClick={() => handleRollback(op.toolUseId)}
                  disabled={rollingBack === op.toolUseId}
                  style={{
                    background: 'none',
                    border: `1px solid ${theme.warningText}`,
                    color: theme.warningText,
                    borderRadius: '3px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    cursor: rollingBack === op.toolUseId ? 'not-allowed' : 'pointer',
                    opacity: rollingBack === op.toolUseId ? 0.6 : 1,
                  }}
                  title="回滚到操作前的状态"
                >
                  {rollingBack === op.toolUseId ? '回滚中...' : '↩ 回滚'}
                </button>
              ) : (
                <span style={{ color: theme.textFaint, fontSize: '10px' }}>无快照</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
