/**
 * AICodeReviewPanel — AI 代码审查面板
 *
 * 功能：
 * - 代码质量评分显示
 * - 安全漏洞检测列表
 * - 性能建议列表
 * - 重构建议列表
 * - 一键修复按钮
 * - 审查历史记录
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'



/** 审查发现级别 */
type Severity = 'critical' | 'warning' | 'info' | 'suggestion'

/** 审查发现类型 */
type FindingCategory = 'security' | 'performance' | 'quality' | 'refactor' | 'style'

/** 单个审查发现 */
interface ReviewFinding {
  id: string
  category: FindingCategory
  severity: Severity
  title: string
  description: string
  filePath: string
  lineNumber: number
  column?: number
  /** 建议的修复代码 */
  suggestedFix?: string
  /** 原始代码片段 */
  originalCode?: string
  /** 是否已修复 */
  fixed?: boolean
}

/** 代码质量评分 */
interface QualityScore {
  overall: number
  security: number
  performance: number
  maintainability: number
  testability: number
}

/** 审查结果 */
interface ReviewResult {
  score: QualityScore
  findings: ReviewFinding[]
  timestamp: number
  duration: number
}

/** 审查历史项 */
interface ReviewHistoryItem {
  filePath: string
  timestamp: number
  score: number
  findingCount: number
}

interface AICodeReviewPanelProps {
  /** 工作目录 */
  cwd: string
  /** 当前审查的文件路径 */
  filePath: string
  /** 主题颜色 */
  theme: ThemeColors
  /** 审查完成回调 */
  onReviewComplete?: (result: ReviewResult) => void
  /** 跳转到代码位置 */
  onNavigateTo?: (filePath: string, lineNumber: number) => void
  /** 是否默认展开 */
  defaultExpanded?: boolean
}

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#FF4444',
  warning: '#FFAA00',
  info: '#4488FF',
  suggestion: '#4ECB71',
}

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: '严重',
  warning: '警告',
  info: '提示',
  suggestion: '建议',
}

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  security: '安全',
  performance: '性能',
  quality: '质量',
  refactor: '重构',
  style: '风格',
}

const CATEGORY_ICONS: Record<FindingCategory, string> = {
  security: '🔒',
  performance: '⚡',
  quality: '✨',
  refactor: '🔧',
  style: '🎨',
}

const REVIEW_HISTORY_KEY = 'doge-code-review-history'

/**
 * 加载审查历史
 */
function loadReviewHistory(): ReviewHistoryItem[] {
  try {
    const raw = localStorage.getItem(REVIEW_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * 保存审查历史
 */
function saveReviewHistory(history: ReviewHistoryItem[]): void {
  try {
    localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(history.slice(0, 50)))
  } catch {
    // ignore
  }
}

/**
 * 评分环形图组件
 */
function ScoreRing({ score, size = 48, strokeWidth = 4, color }: { score: number; size?: number; strokeWidth?: number; color: string }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#333" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AICodeReviewPanel({
  cwd,
  filePath,
  theme,
  onReviewComplete,
  onNavigateTo,
  defaultExpanded = false,
}: AICodeReviewPanelProps): JSX.Element {
  const c = theme
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [activeFilter, setActiveFilter] = useState<FindingCategory | 'all'>('all')
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all')
  const [history, setHistory] = useState<ReviewHistoryItem[]>(loadReviewHistory())
  const [fixedFindings, setFixedFindings] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // 执行代码审查
  const runReview = useCallback(async () => {
    if (!filePath) return

    setIsReviewing(true)
    setError(null)
    setFixedFindings(new Set())

    try {
      const reviewResult = await window.dogeAPI?.codeReview?.({
        filePath,
        cwd,
      })

      if (reviewResult?.success && reviewResult.result) {
        const newResult: ReviewResult = {
          score: reviewResult.result.score,
          findings: (reviewResult.result.findings || []) as any[],
          timestamp: Date.now(),
          duration: reviewResult.result.duration || 0,
        }
        setResult(newResult)
        onReviewComplete?.(newResult)

        // 添加到历史
        const newItem: ReviewHistoryItem = {
          filePath,
          timestamp: Date.now(),
          score: newResult.score.overall,
          findingCount: newResult.findings.length,
        }
        const newHistory = [newItem, ...history.filter(h => h.filePath !== filePath)].slice(0, 50)
        setHistory(newHistory)
        saveReviewHistory(newHistory)
      } else {
        setError(reviewResult?.error || '审查失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '审查请求失败')
    } finally {
      setIsReviewing(false)
    }
  }, [filePath, cwd, history, onReviewComplete])

  // 一键修复
  const handleFix = useCallback(async (finding: ReviewFinding) => {
    if (!finding.suggestedFix) return
    try {
      const fixResult = await window.dogeAPI?.applyFix?.({
        filePath: finding.filePath,
        lineNumber: finding.lineNumber,
        column: finding.column,
        fixedCode: finding.suggestedFix,
        originalCode: finding.originalCode,
      })
      if (fixResult?.success) {
        setFixedFindings(prev => new Set(prev).add(finding.id))
      } else {
        console.error('修复失败:', fixResult?.error)
      }
    } catch {
      console.error('修复请求失败')
    }
  }, [])

  // 过滤发现
  const filteredFindings = result?.findings.filter(f => {
    if (activeFilter !== 'all' && f.category !== activeFilter) return false
    if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false
    return true
  }) || []

  // 评分颜色
  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#4ECB71'
    if (score >= 60) return '#FFAA00'
    return '#FF4444'
  }

  const headerStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: `1px solid ${c.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    backgroundColor: c.bgPanel,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 面板头部 */}
      <div style={headerStyle} onClick={() => setExpanded(p => !p)}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          AI 代码审查
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {result && (
            <span style={{ fontSize: '10px', color: getScoreColor(result.score.overall), fontWeight: 600 }}>
              {result.score.overall}/100
            </span>
          )}
          <span style={{ fontSize: '10px', color: c.textFaint }}>
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* 操作栏 */}
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={runReview}
              disabled={isReviewing || !filePath}
              style={{
                padding: '4px 12px',
                border: 'none',
                borderRadius: '3px',
                backgroundColor: isReviewing ? c.surface : c.accent,
                color: isReviewing ? c.textFaint : '#000',
                cursor: isReviewing ? 'not-allowed' : 'pointer',
                fontSize: '10px',
                fontWeight: 600,
              }}
            >
              {isReviewing ? '审查中...' : '开始审查'}
            </button>
            {result && (
              <span style={{ fontSize: '10px', color: c.textFaint }}>
                {result.findings.length} 个发现 · {(result.duration / 1000).toFixed(1)}s
              </span>
            )}
          </div>

          {/* 错误信息 */}
          {error && (
            <div style={{ padding: '6px 12px', color: c.errorText, fontSize: '10px' }}>
              {error}
            </div>
          )}

          {/* 评分显示 */}
          {result && (
            <div style={{ padding: '12px', borderBottom: `1px solid ${c.borderSubtle}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                <div style={{ position: 'relative', width: 56, height: 56 }}>
                  <ScoreRing score={result.score.overall} size={56} color={getScoreColor(result.score.overall)} />
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: getScoreColor(result.score.overall),
                  }}>
                    {result.score.overall}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '4px' }}>综合评分</div>
                  <div style={{ fontSize: '10px', color: c.textMuted, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                    <span>安全: {result.score.security}</span>
                    <span>性能: {result.score.performance}</span>
                    <span>可维护: {result.score.maintainability}</span>
                    <span>可测试: {result.score.testability}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 过滤选项 */}
          {result && result.findings.length > 0 && (
            <div style={{ padding: '6px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {(['all', 'security', 'performance', 'quality', 'refactor'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveFilter(cat)}
                    style={{
                      padding: '2px 8px',
                      border: '1px solid',
                      borderColor: activeFilter === cat ? c.accent : c.border,
                      borderRadius: '10px',
                      backgroundColor: activeFilter === cat ? c.accentDim : 'transparent',
                      color: activeFilter === cat ? c.accent : c.textMuted,
                      cursor: 'pointer',
                      fontSize: '9px',
                    }}
                  >
                    {cat === 'all' ? '全部' : `${CATEGORY_ICONS[cat]} ${CATEGORY_LABELS[cat]}`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['all', 'critical', 'warning', 'info', 'suggestion'] as const).map(sev => (
                  <button
                    key={sev}
                    onClick={() => setFilterSeverity(sev)}
                    style={{
                      padding: '2px 6px',
                      border: '1px solid',
                      borderColor: filterSeverity === sev ? SEVERITY_COLORS[sev === 'all' ? 'info' : sev] : c.border,
                      borderRadius: '3px',
                      backgroundColor: filterSeverity === sev ? `${SEVERITY_COLORS[sev === 'all' ? 'info' : sev]}22` : 'transparent',
                      color: filterSeverity === sev ? SEVERITY_COLORS[sev === 'all' ? 'info' : sev] : c.textFaint,
                      cursor: 'pointer',
                      fontSize: '9px',
                    }}
                  >
                    {sev === 'all' ? '全部级别' : SEVERITY_LABELS[sev]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 发现列表 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredFindings.map((finding) => (
              <div
                key={finding.id}
                style={{
                  padding: '8px 12px',
                  borderBottom: `1px solid ${c.borderSubtle}`,
                  opacity: fixedFindings.has(finding.id) ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                    <span style={{ fontSize: '10px' }}>{CATEGORY_ICONS[finding.category]}</span>
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        backgroundColor: `${SEVERITY_COLORS[finding.severity]}22`,
                        color: SEVERITY_COLORS[finding.severity],
                        fontWeight: 600,
                      }}
                    >
                      {SEVERITY_LABELS[finding.severity]}
                    </span>
                    <span style={{ fontSize: '11px', color: c.text, fontWeight: 500 }}>{finding.title}</span>
                  </div>
                  {finding.suggestedFix && !fixedFindings.has(finding.id) && (
                    <button
                      onClick={() => handleFix(finding)}
                      style={{
                        padding: '2px 8px',
                        border: `1px solid ${c.accent}`,
                        borderRadius: '3px',
                        backgroundColor: 'transparent',
                        color: c.accent,
                        cursor: 'pointer',
                        fontSize: '9px',
                        flexShrink: 0,
                      }}
                    >
                      修复
                    </button>
                  )}
                  {fixedFindings.has(finding.id) && (
                    <span style={{ fontSize: '9px', color: c.accent }}>已修复</span>
                  )}
                </div>
                <div style={{ fontSize: '10px', color: c.textMuted, marginBottom: '4px' }}>
                  {finding.description}
                </div>
                <div
                  onClick={() => onNavigateTo?.(finding.filePath, finding.lineNumber)}
                  style={{ fontSize: '9px', color: c.textFaint, cursor: 'pointer' }}
                >
                  📄 {finding.filePath.replace(cwd + '/', '')}:{finding.lineNumber}
                </div>
                {finding.originalCode && (
                  <pre style={{
                    margin: '4px 0 0',
                    padding: '4px 8px',
                    backgroundColor: c.codeBg,
                    border: `1px solid ${c.border}`,
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: c.textMuted,
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {finding.originalCode}
                  </pre>
                )}
              </div>
            ))}

            {/* 空状态 */}
            {result && filteredFindings.length === 0 && (
              <div style={{ padding: '16px 12px', color: c.textFaint, fontSize: '11px', textAlign: 'center' }}>
                {activeFilter === 'all' && filterSeverity === 'all' ? '未发现问题' : '当前过滤条件下无结果'}
              </div>
            )}

            {/* 空状态 - 未审查 */}
            {!result && !isReviewing && (
              <div style={{ padding: '16px 12px', color: c.textFaint, fontSize: '11px', textAlign: 'center' }}>
                点击"开始审查"按钮分析代码
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AICodeReviewPanel
