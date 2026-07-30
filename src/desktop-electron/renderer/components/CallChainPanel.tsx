/**
 * CallChainPanel — 调用链分析面板组件
 *
 * 展示当前文件中函数的调用关系：
 * - 函数列表 + 调用者/被调用者
 * - 调用树可视化
 * - 点击跳转到定义位置
 */

import React, { useCallback, useMemo } from 'react'
import type { ThemeColors } from '../theme.js'
import type { CallNode, CallChainResult } from '../hooks/useCallChain'

interface CallChainPanelProps {
  /** 调用链分析结果 */
  result: CallChainResult
  /** 当前文件路径 */
  filePath: string
  /** 主题颜色 */
  theme: ThemeColors
  /** 关闭回调 */
  onClose: () => void
  /** 跳转到定义回调 */
  onGoToDefinition?: (filePath: string, line: number, column: number) => void
}

export function CallChainPanel({
  result,
  filePath,
  theme,
  onClose,
  onGoToDefinition,
}: CallChainPanelProps): JSX.Element {
  const c = theme
  const fileName = filePath.split(/[/\\]/).pop() || filePath

  const handleNodeClick = useCallback((node: CallNode) => {
    if (!onGoToDefinition) return
    if (node.isLocal && node.line > 0) {
      onGoToDefinition(node.filePath, node.line, node.column)
    }
  }, [onGoToDefinition])

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '600px',
    maxHeight: '70vh',
    background: c.bgPanel,
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    color: c.text,
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: `1px solid ${c.border}`,
    background: c.bgAlt,
  }

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  }

  const functionCardStyle = (isHighlighted: boolean): React.CSSProperties => ({
    padding: '8px 10px',
    border: `1px solid ${isHighlighted ? c.accent : c.border}`,
    borderRadius: '4px',
    marginBottom: '4px',
    background: isHighlighted ? c.accentDim : c.bgAlt,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  })

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 7px',
    borderRadius: '10px',
    background: color + '22',
    color,
    fontSize: '11px',
    fontWeight: 500,
  })

  const emptyStyle: React.CSSProperties = {
    color: c.textMuted,
    fontSize: '12px',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px',
  }

  // 统计信息
  const stats = useMemo(() => {
    const totalFunctions = result.localFunctions.length
    const functionsWithCallers = result.localFunctions.filter(f => f.callers.length > 0).length
    const functionsWithCallees = result.localFunctions.filter(f => f.callees.length > 0).length
    const avgCallCount = totalFunctions > 0
      ? Math.round(result.localFunctions.reduce((sum, f) => sum + f.callCount, 0) / totalFunctions)
      : 0

    return { totalFunctions, functionsWithCallers, functionsWithCallees, avgCallCount, totalChains: result.totalChains }
  }, [result])

  return (
    <div style={containerStyle}>
      {/* 头部 */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>🔗 调用链分析</span>
          <span style={{ color: c.textMuted, fontSize: '11px' }}>{fileName}</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.textFaint, cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
      </div>

      {/* 统计栏 */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${c.border}`, background: c.bgAlt, flexWrap: 'wrap' }}>
        <span style={badgeStyle(c.accent)}>函数: {stats.totalFunctions}</span>
        <span style={badgeStyle('#4FC3F7')}>被调用: {stats.functionsWithCallers}</span>
        <span style={badgeStyle('#81C784')}>调用他: {stats.functionsWithCallees}</span>
        <span style={badgeStyle('#FFB74D')}>调用链: {stats.totalChains}</span>
        <span style={badgeStyle(c.textMuted)}>平均调用: {stats.avgCallCount}次</span>
      </div>

      {/* 函数列表 */}
      <div style={bodyStyle}>
        {result.localFunctions.length === 0 ? (
          <div style={emptyStyle}>
            未检测到函数定义。<br />
            请在代码编辑器中打开文件以分析调用关系。
          </div>
        ) : (
          result.localFunctions.map((fn) => (
            <div key={fn.name + fn.line} style={functionCardStyle(fn.callCount > 0)}>
              {/* 函数名称 + 位置 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: fn.callers.length > 0 || fn.callees.length > 0 ? '6px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', fontFamily: 'monospace' }}>
                    {fn.name}
                  </span>
                  <span style={{ color: c.textMuted, fontSize: '11px' }}>
                    L{fn.line}:{fn.column}
                  </span>
                  {fn.callCount > 0 && (
                    <span style={badgeStyle('#FFB74D')}>{fn.callCount}次调用</span>
                  )}
                </div>
                <button
                  onClick={() => handleNodeClick(fn)}
                  style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: '3px', color: c.accent, cursor: 'pointer', fontSize: '10px', padding: '2px 6px' }}
                  title="跳转到定义"
                >
                  跳转
                </button>
              </div>

              {/* 调用者 */}
              {fn.callers.length > 0 && (
                <div style={{ marginLeft: '16px', marginBottom: '4px' }}>
                  <div style={{ color: c.textMuted, fontSize: '11px', marginBottom: '2px' }}>
                    ↑ 被调用 ({fn.callers.length}):
                  </div>
                  {fn.callers.map((caller, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0', fontSize: '11px' }}>
                      <span style={{ color: '#4FC3F7' }}>↖</span>
                      <span style={{ fontFamily: 'monospace', color: c.text }}>{caller.name}</span>
                      {!caller.isLocal && <span style={{ color: c.textFaint, fontSize: '10px' }}>(外部)</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* 被调用者 */}
              {fn.callees.length > 0 && (
                <div style={{ marginLeft: '16px' }}>
                  <div style={{ color: c.textMuted, fontSize: '11px', marginBottom: '2px' }}>
                    ↓ 调用了 ({fn.callees.length}):
                  </div>
                  {fn.callees.map((callee, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0', fontSize: '11px' }}>
                      <span style={{ color: '#81C784' }}>↘</span>
                      <span style={{ fontFamily: 'monospace', color: c.text }}>{callee.name}</span>
                      {!callee.isLocal && <span style={{ color: c.textFaint, fontSize: '10px' }}>(外部)</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* 无调用关系 */}
              {fn.callers.length === 0 && fn.callees.length === 0 && (
                <div style={{ color: c.textFaint, fontSize: '10px', fontStyle: 'italic' }}>
                  无调用关系
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部提示 */}
      <div style={{ padding: '6px 12px', borderTop: `1px solid ${c.border}`, background: c.bgAlt, fontSize: '10px', color: c.textFaint }}>
        点击函数名称跳转到定义位置 | 基于 LSP references 和静态分析
      </div>
    </div>
  )
}
