/**
 * PerformanceRefactorPanel — 性能建议与重构建议面板
 *
 * 功能：
 * - 基于 AI 代码审查的性能/重构建议展示
 * - 五维评分展示（overall/security/performance/maintainability/testability）
 * - 按严重级别筛选（critical/high/medium/low/info）
 * - 按类别筛选（performance/refactor/maintainability）
 * - 一键修复（调用 apply-fix IPC）
 * - 审查历史记录
 * - 文件/目录扫描
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
type Category = 'performance' | 'refactor' | 'maintainability' | 'security' | 'quality' | 'style'

interface RefactorFinding {
  id: string
  category: Category
  severity: Severity
  title: string
  description: string
  filePath: string
  lineNumber: number
  column?: number
  suggestedFix?: string
  originalCode?: string
}

interface QualityScore {
  overall: number
  security: number
  performance: number
  maintainability: number
  testability: number
}

interface ReviewResult {
  score: QualityScore
  findings: RefactorFinding[]
  timestamp: number
  duration: number
}

interface PerformanceRefactorPanelProps {
  cwd: string
  theme: ThemeColors
  scanPath?: string
  onNavigateTo?: (filePath: string, lineNumber: number) => void
}

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#FF4444',
  high: '#FF6600',
  medium: '#FFAA00',
  low: '#4488FF',
  info: '#888888',
}

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '提示',
}

const CATEGORY_LABELS: Record<string, string> = {
  performance: '⚡ 性能',
  refactor: '🔧 重构',
  maintainability: '📐 可维护性',
  security: '🔒 安全',
  quality: '✨ 质量',
  style: '🎨 风格',
}

const HISTORY_KEY = 'doge-refactor-history'

export function PerformanceRefactorPanel({ cwd, theme, scanPath, onNavigateTo }: PerformanceRefactorPanelProps): JSX.Element {
  const c = theme
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [path, setPath] = useState(scanPath || cwd)
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all')
  const [history, setHistory] = useState<ReviewHistoryItem[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) setHistory(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  const runAnalysis = useCallback(async () => {
    if (!path) return
    setIsScanning(true)
    setError(null)
    setResult(null)
    try {
      const reviewResult = await window.dogeAPI?.codeReview?.({ filePath: path, cwd })
      if (reviewResult?.success && reviewResult.result) {
        const typed: ReviewResult = {
          score: reviewResult.result.score as QualityScore,
          findings: (reviewResult.result.findings || []).map((f: Record<string, unknown>) => ({
            id: String(f.id ?? `f-${Math.random().toString(36).slice(2, 8)}`),
            category: (f.category as Category) || 'quality',
            severity: (f.severity as Severity) || 'info',
            title: String(f.title ?? '未命名问题'),
            description: String(f.description ?? ''),
            filePath: String(f.filePath ?? path),
            lineNumber: Number(f.lineNumber ?? 1),
            column: f.column ? Number(f.column) : undefined,
            suggestedFix: f.suggestedFix ? String(f.suggestedFix) : undefined,
            originalCode: f.originalCode ? String(f.originalCode) : undefined,
          })),
          timestamp: Date.now(),
          duration: reviewResult.result.duration || 0,
        }
        setResult(typed)
        const newHistory = [
          { filePath: path, timestamp: Date.now(), score: typed.score.overall, findingCount: typed.findings.length },
          ...history.slice(0, 49),
        ]
        setHistory(newHistory)
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory)) } catch { /* ignore */ }
      } else {
        setError(reviewResult?.error || '分析失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setIsScanning(false)
    }
  }, [path, cwd, history])

  const applyFix = useCallback(async (finding: RefactorFinding) => {
    if (!finding.suggestedFix) return
    try {
      await window.dogeAPI?.applyFix?.({
        filePath: finding.filePath,
        lineNumber: finding.lineNumber,
        column: finding.column || 0,
        fixedCode: finding.suggestedFix,
        originalCode: finding.originalCode,
      })
    } catch { /* ignore */ }
  }, [])

  const filteredFindings = result?.findings.filter(f => {
    if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false
    if (filterCategory !== 'all' && f.category !== filterCategory) return false
    return true
  }) || []

  const relevantCategories: Category[] = ['performance', 'refactor', 'maintainability']
  const relevantFindings = result?.findings.filter(f => relevantCategories.includes(f.category)) || []

  const headerStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: `1px solid ${c.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Performance & Refactor
        </span>
        {result && (
          <span style={{ fontSize: '10px', color: c.textMuted }}>
            {relevantFindings.length} relevant
          </span>
        )}
      </div>

      {/* Action bar */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="Target file or directory..."
            style={{ flex: 1, padding: '4px 8px', background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={runAnalysis}
            disabled={isScanning || !path}
            style={{
              padding: '4px 12px', border: 'none', borderRadius: '3px',
              backgroundColor: isScanning ? c.surface : c.accent,
              color: isScanning ? c.textFaint : '#000',
              cursor: isScanning ? 'not-allowed' : 'pointer',
              fontSize: '10px', fontWeight: 600,
            }}
          >
            {isScanning ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>

        {/* Score rings */}
        {result && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0' }}>
            {(['overall', 'performance', 'maintainability', 'testability', 'security'] as const).map(key => {
              const score = result.score[key]
              const color = score >= 80 ? '#4ECB71' : score >= 60 ? '#FFAA00' : '#FF4444'
              const label = key === 'overall' ? '综合' : key === 'performance' ? '性能' : key === 'maintainability' ? '维护性' : key === 'testability' ? '可测性' : '安全'
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <div style={{ position: 'relative', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="40" height="40" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                      <circle cx="20" cy="20" r="16" fill="none" stroke={c.border} strokeWidth="3" />
                      <circle cx="20" cy="20" r="16" fill="none" stroke={color} strokeWidth="3" strokeDasharray={2 * Math.PI * 16} strokeDashoffset={2 * Math.PI * 16 - (score / 100) * 2 * Math.PI * 16} strokeLinecap="round" />
                    </svg>
                    <span style={{ fontSize: '9px', fontWeight: 600, color }}>{score}</span>
                  </div>
                  <span style={{ fontSize: '8px', color: c.textFaint }}>{label}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Category filter */}
        {result && result.findings.length > 0 && (
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: c.textFaint, marginRight: '2px' }}>类别:</span>
            {(['all', 'performance', 'refactor', 'maintainability'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat as Category | 'all')}
                style={{
                  padding: '1px 6px', border: '1px solid',
                  borderColor: filterCategory === cat ? (cat === 'all' ? c.accent : SEVERITY_COLORS[cat === 'performance' ? 'high' : cat === 'refactor' ? 'medium' : 'low']) : c.border,
                  borderRadius: '10px',
                  backgroundColor: filterCategory === cat ? (cat === 'all' ? `${c.accent}22` : `${SEVERITY_COLORS[cat === 'performance' ? 'high' : cat === 'refactor' ? 'medium' : 'low']}22`) : 'transparent',
                  color: filterCategory === cat ? (cat === 'all' ? c.accent : SEVERITY_COLORS[cat === 'performance' ? 'high' : cat === 'refactor' ? 'medium' : 'low']) : c.textFaint,
                  cursor: 'pointer', fontSize: '9px',
                }}
              >
                {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]?.split(' ')[1] || cat}
              </button>
            ))}
          </div>
        )}

        {/* Severity filter */}
        {filteredFindings.length > 0 && (
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['all', 'critical', 'high', 'medium', 'low', 'info'] as const).map(sev => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev as Severity | 'all')}
                style={{
                  padding: '1px 6px', border: '1px solid',
                  borderColor: filterSeverity === sev ? (sev === 'all' ? c.accent : SEVERITY_COLORS[sev]) : c.border,
                  borderRadius: '3px',
                  backgroundColor: filterSeverity === sev ? (sev === 'all' ? `${c.accent}22` : `${SEVERITY_COLORS[sev]}22`) : 'transparent',
                  color: filterSeverity === sev ? (sev === 'all' ? c.accent : SEVERITY_COLORS[sev]) : c.textFaint,
                  cursor: 'pointer', fontSize: '9px',
                }}
              >
                {sev === 'all' ? 'All' : SEVERITY_LABELS[sev]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 12px', color: c.errorText, fontSize: '10px' }}>
          {error}
        </div>
      )}

      {/* Findings list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isScanning && (
          <div style={{ padding: '16px 12px', color: c.textMuted, fontSize: '11px', textAlign: 'center' }}>
            Analyzing code...
          </div>
        )}
        {!isScanning && !result && !error && (
          <div style={{ padding: '16px 12px', color: c.textFaint, fontSize: '11px', textAlign: 'center' }}>
            Click "Analyze" to detect performance and refactor opportunities
          </div>
        )}
        {!isScanning && result && filteredFindings.length === 0 && (
          <div style={{ padding: '16px 12px', color: c.textFaint, fontSize: '11px', textAlign: 'center' }}>
            No findings match the current filter
          </div>
        )}
        {filteredFindings.map(finding => (
          <div
            key={finding.id}
            style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}` }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                <span style={{
                  fontSize: '9px', padding: '1px 6px', borderRadius: '3px',
                  backgroundColor: `${SEVERITY_COLORS[finding.severity]}22`,
                  color: SEVERITY_COLORS[finding.severity], fontWeight: 600,
                }}>
                  {SEVERITY_LABELS[finding.severity]}
                </span>
                <span style={{ fontSize: '10px', color: c.text, fontWeight: 500 }}>
                  {CATEGORY_LABELS[finding.category]?.split(' ')[1] || finding.category}
                </span>
              </div>
              <span style={{ fontSize: '9px', color: c.textFaint, cursor: 'pointer' }} onClick={() => onNavigateTo?.(finding.filePath, finding.lineNumber)}>
                L{finding.lineNumber}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: c.text, fontWeight: 500, marginBottom: '2px' }}>
              {finding.title}
            </div>
            <div style={{ fontSize: '9px', color: c.textMuted, marginBottom: '4px', lineHeight: 1.4 }}>
              {finding.description}
            </div>
            {finding.originalCode && (
              <pre style={{
                margin: '0 0 4px 0', padding: '3px 6px', background: c.codeBg,
                border: `1px solid ${c.border}`, borderRadius: '2px',
                fontSize: '9px', fontFamily: 'monospace', color: c.textMuted,
                overflowX: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {finding.originalCode.substring(0, 80)}
              </pre>
            )}
            {finding.suggestedFix && (
              <button
                onClick={() => applyFix(finding)}
                style={{
                  padding: '2px 8px', border: `1px solid ${c.accent}`, borderRadius: '2px',
                  background: 'transparent', color: c.accent, cursor: 'pointer', fontSize: '9px',
                }}
              >
                Apply Fix
              </button>
            )}
          </div>
        ))}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={{ borderTop: `1px solid ${c.border}`, maxHeight: '120px', overflowY: 'auto' }}>
          <div style={{ padding: '4px 12px', fontSize: '9px', color: c.textFaint, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            History
          </div>
          {history.slice(0, 5).map((item, idx) => (
            <div
              key={idx}
              onClick={() => setPath(item.filePath)}
              style={{
                padding: '3px 12px', fontSize: '9px', color: c.textMuted, cursor: 'pointer',
                borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', justifyContent: 'space-between',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                {item.filePath.replace(cwd + '/', '')}
              </span>
              <span style={{ color: item.score >= 80 ? '#4ECB71' : item.score >= 60 ? '#FFAA00' : '#FF4444' }}>
                {item.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface ReviewHistoryItem {
  filePath: string
  timestamp: number
  score: number
  findingCount: number
}

export default PerformanceRefactorPanel
