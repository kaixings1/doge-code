/**
 * ProblemsPanel — 问题面板
 *
 * 聚合所有文件的 LSP 诊断，支持：
 * - 按级别过滤
 * - 按文件过滤
 * - 清空诊断
 * - 点击跳转
 */

import React, { useMemo } from 'react'
import type { ThemeColors } from '../theme.js'
import type { ProblemItem, ProblemLevel } from '../hooks/useProblems.js'

const LEVEL_LABEL: Record<ProblemLevel, string> = {
  error: ' Error',
  warning: '🟡 Warning',
  info: 'ℹ Info',
}

const LEVEL_COLOR: Record<ProblemLevel, string> = {
  error: '#FF6B6B',
  warning: '#FFB74D',
  info: '#64B5F6',
}

const ALL_LEVELS: ProblemLevel[] = ['error', 'warning', 'info']

export function ProblemsPanel({
  problems,
  filteredProblems,
  filterLevels,
  onToggleFilterLevel,
  filterFiles,
  onToggleFilterFile,
  onClear,
  theme,
  onNavigate,
}: {
  problems: ProblemItem[]
  filteredProblems: ProblemItem[]
  filterLevels: ProblemLevel[]
  onToggleFilterLevel: (level: ProblemLevel) => void
  filterFiles: string[]
  onToggleFilterFile: (file: string) => void
  onClear: () => void
  theme: ThemeColors
  onNavigate?: (filePath: string, line: number, column: number) => void
}): JSX.Element {
  const c = theme

  const uniqueFiles = useMemo(() => {
    const set = new Set<string>()
    problems.forEach(p => set.add(p.filePath))
    return Array.from(set)
  }, [problems])

  const handleRowClick = (item: ProblemItem) => {
    onNavigate?.(item.filePath, item.line, item.column)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: c.bgPanel,
        color: c.text,
        fontSize: '11px',
      }}
    >
      {/* 标题栏 */}
      <div
        style={{
          padding: '6px 8px',
          borderBottom: `1px solid ${c.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: c.bgAlt,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '11px' }}> Problems</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ color: c.textFaint, fontSize: '10px' }}>
            {filteredProblems.length}/{problems.length}
          </span>
          <button
            onClick={onClear}
            style={{
              padding: '2px 8px',
              border: `1px solid ${c.border}`,
              borderRadius: '3px',
              background: 'transparent',
              color: c.textFaint,
              cursor: 'pointer',
              fontSize: '9px',
            }}
            title="清空所有问题"
          >
            清空
          </button>
        </div>
      </div>

      {/* 过滤栏 */}
      <div
        style={{
          padding: '6px 8px',
          borderBottom: `1px solid ${c.border}`,
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: c.bgAlt,
        }}
      >
        <span style={{ color: c.textFaint, fontSize: '9px', marginRight: '2px' }}>级别:</span>
        {ALL_LEVELS.map(level => {
          const active = filterLevels.includes(level)
          return (
            <button
              key={level}
              onClick={() => onToggleFilterLevel(level)}
              style={{
                padding: '2px 8px',
                border: `1px solid ${active ? LEVEL_COLOR[level] : c.border}`,
                borderRadius: '3px',
                background: active ? `${LEVEL_COLOR[level]}22` : 'transparent',
                color: active ? LEVEL_COLOR[level] : c.textFaint,
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: active ? 600 : 400,
              }}
            >
              {LEVEL_LABEL[level]}
            </button>
          )
        })}

        {uniqueFiles.length > 0 && (
          <>
            <span style={{ color: c.textFaint, fontSize: '9px', marginLeft: '8px', marginRight: '2px' }}>文件:</span>
            <select
              multiple
              value={filterFiles}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions).map(opt => opt.value)
                onToggleFilterFile(selected[0] || '')
              }}
              style={{
                padding: '2px 4px',
                background: c.inputBg,
                border: `1px solid ${c.border}`,
                borderRadius: '3px',
                color: c.text,
                fontSize: '10px',
                outline: 'none',
                height: '24px',
              }}
              title="选择要过滤的文件"
            >
              {uniqueFiles.map(file => (
                <option key={file} value={file}>
                  {file.split(/[/\\]/).pop() || file}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* 问题列表 */}
      {filteredProblems.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: c.textFaint,
            fontSize: '11px',
          }}
        >
          暂无匹配的问题
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '10px',
              tableLayout: 'fixed',
            }}
          >
            <thead>
              <tr style={{ background: c.bgAlt }}>
                <th style={{ width: '38%', padding: '4px 8px', textAlign: 'left', borderBottom: `1px solid ${c.border}`, color: c.textFaint, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>文件路径</th>
                <th style={{ width: '8%', padding: '4px 4px', textAlign: 'center', borderBottom: `1px solid ${c.border}`, color: c.textFaint, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>行号</th>
                <th style={{ width: '18%', padding: '4px 8px', textAlign: 'left', borderBottom: `1px solid ${c.border}`, color: c.textFaint, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>级别</th>
                <th style={{ width: '36%', padding: '4px 8px', textAlign: 'left', borderBottom: `1px solid ${c.border}`, color: c.textFaint, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>消息</th>
              </tr>
            </thead>
            <tbody>
              {filteredProblems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => handleRowClick(item)}
                  style={{
                    cursor: 'pointer',
                    borderBottom: `1px solid ${c.borderSubtle || c.border}`,
                    background: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    const row = e.currentTarget as HTMLTableRowElement
                    row.style.background = `${c.accent}11`
                  }}
                  onMouseLeave={(e) => {
                    const row = e.currentTarget as HTMLTableRowElement
                    row.style.background = 'transparent'
                  }}
                >
                  <td
                    style={{
                      padding: '3px 8px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontFamily: 'monospace',
                      color: c.textMuted,
                    }}
                    title={item.filePath}
                  >
                    {item.filePath}
                  </td>
                  <td style={{ padding: '3px 4px', textAlign: 'center', color: c.textFaint, fontFamily: 'monospace' }}>
                    {item.line}:{item.column}
                  </td>
                  <td style={{ padding: '3px 8px' }}>
                    <span style={{ color: LEVEL_COLOR[item.level], fontSize: '10px', fontWeight: 600 }}>
                      {LEVEL_LABEL[item.level]}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '3px 8px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: c.text,
                    }}
                    title={item.message}
                  >
                    {item.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
