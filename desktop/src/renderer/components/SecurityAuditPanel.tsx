/**
 * SecurityAuditPanel — 安全漏洞扫描面板
 *
 * 功能：
 * - OWASP Top 10 规则扫描
 * - 高危/中危/低危问题分类展示
 * - 文件/目录扫描切换
 * - 规则筛选
 * - 扫描统计
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

type Severity = 'high' | 'medium' | 'low'
type ScanType = 'file' | 'directory'

interface SecurityIssue {
  id: string
  file: string
  line: number
  rule: string
  severity: Severity
  message: string
  code: string
}

interface SecurityRule {
  id: string
  severity: Severity
  message: string
}

interface SecurityStats {
  total: number
  high: number
  medium: number
  low: number
}

interface SecurityAuditPanelProps {
  cwd: string
  theme: ThemeColors
  scanPath?: string
  onNavigateTo?: (filePath: string, lineNumber: number) => void
}

const SEVERITY_COLORS: Record<Severity, string> = {
  high: '#FF4444',
  medium: '#FFAA00',
  low: '#4488FF',
}

const SEVERITY_LABELS: Record<Severity, string> = {
  high: '高危',
  medium: '中危',
  low: '低危',
}

export function SecurityAuditPanel({ cwd, theme, scanPath, onNavigateTo }: SecurityAuditPanelProps): JSX.Element {
  const c = theme
  const [issues, setIssues] = useState<SecurityIssue[]>([])
  const [stats, setStats] = useState<SecurityStats>({ total: 0, high: 0, medium: 0, low: 0 })
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanType, setScanType] = useState<ScanType>('file')
  const [path, setPath] = useState(scanPath || cwd)
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all')
  const [rules, setRules] = useState<SecurityRule[]>([])
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set())

  // Load rules list
  useEffect(() => {
    window.dogeAPI?.securityRules?.().then(res => {
      if (res?.success && res.rules) {
        const typedRules: SecurityRule[] = res.rules.map(r => ({
          id: r.id,
          severity: r.severity as Severity,
          message: r.message,
        }))
        setRules(typedRules)
        setSelectedRules(new Set(typedRules.map(r => r.id)))
      }
    }).catch(() => {})
  }, [])

  // Run scan
  const runScan = useCallback(async () => {
    if (!path) return
    setIsScanning(true)
    setError(null)
    setIssues([])
    try {
      const ruleArr = selectedRules.size > 0 ? Array.from(selectedRules) : undefined
      const result = await window.dogeAPI?.securityAudit?.({
        scanPath: path,
        rules: ruleArr,
        scanType,
      })
      if (result?.success) {
        const typedIssues: SecurityIssue[] = (result.issues || []).map(i => ({
          id: i.id,
          file: i.file,
          line: i.line,
          rule: i.rule,
          severity: i.severity as Severity,
          message: i.message,
          code: i.code,
        }))
        setIssues(typedIssues)
        setStats(result.stats || { total: 0, high: 0, medium: 0, low: 0 })
      } else {
        setError(result?.error || '扫描失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '扫描请求失败')
    } finally {
      setIsScanning(false)
    }
  }, [path, scanType, selectedRules])

  // Filter issues
  const filteredIssues = issues.filter(i => {
    if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false
    return true
  })

  const toggleRule = (ruleId: string) => {
    setSelectedRules(prev => {
      const next = new Set(prev)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }

  const selectAllRules = () => setSelectedRules(new Set(rules.map(r => r.id)))
  const clearAllRules = () => setSelectedRules(new Set())

  const headerStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: `1px solid ${c.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Panel header */}
      <div style={headerStyle}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Security Audit
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {stats.total > 0 && (
            <>
              <span style={{ fontSize: '10px', color: SEVERITY_COLORS.high, fontWeight: 600 }}>{stats.high} high</span>
              <span style={{ fontSize: '10px', color: SEVERITY_COLORS.medium, fontWeight: 600 }}>{stats.medium} medium</span>
              <span style={{ fontSize: '10px', color: SEVERITY_COLORS.low, fontWeight: 600 }}>{stats.low} low</span>
            </>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Path input + scan type */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="Scan path..."
            style={{ flex: 1, padding: '4px 8px', background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }}
          />
          <select
            value={scanType}
            onChange={e => setScanType(e.target.value as ScanType)}
            style={{ padding: '4px 6px', background: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }}
          >
            <option value="file">File</option>
            <option value="directory">Directory</option>
          </select>
        </div>

        {/* Scan button + rule filter */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={runScan}
            disabled={isScanning || !path}
            style={{
              padding: '4px 12px',
              border: 'none',
              borderRadius: '3px',
              backgroundColor: isScanning ? c.surface : c.accent,
              color: isScanning ? c.textFaint : '#000',
              cursor: isScanning ? 'not-allowed' : 'pointer',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            {isScanning ? 'Scanning...' : 'Scan'}
          </button>
          <span style={{ fontSize: '9px', color: c.textFaint, marginLeft: '4px' }}>
            {selectedRules.size}/{rules.length} rules
          </span>
          <span style={{ fontSize: '9px', color: c.textFaint, cursor: 'pointer', marginLeft: 'auto' }} onClick={selectAllRules}>All</span>
          <span style={{ fontSize: '9px', color: c.textFaint, cursor: 'pointer' }} onClick={clearAllRules}>None</span>
        </div>

        {/* Rule tags */}
        {rules.length > 0 && (
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {rules.map(rule => {
              const active = selectedRules.has(rule.id)
              return (
                <button
                  key={rule.id}
                  onClick={() => toggleRule(rule.id)}
                  style={{
                    padding: '1px 6px',
                    border: `1px solid ${active ? SEVERITY_COLORS[rule.severity] : c.border}`,
                    borderRadius: '10px',
                    backgroundColor: active ? `${SEVERITY_COLORS[rule.severity]}22` : 'transparent',
                    color: active ? SEVERITY_COLORS[rule.severity] : c.textFaint,
                    cursor: 'pointer',
                    fontSize: '9px',
                  }}
                >
                  {rule.id}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div style={{ padding: '6px 12px', color: c.errorText, fontSize: '10px' }}>
          {error}
        </div>
      )}

      {/* Severity filter */}
      {issues.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', gap: '4px' }}>
          {(['all', 'high', 'medium', 'low'] as const).map(sev => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              style={{
                padding: '2px 8px',
                border: '1px solid',
                borderColor: filterSeverity === sev ? (sev === 'all' ? c.accent : SEVERITY_COLORS[sev]) : c.border,
                borderRadius: '3px',
                backgroundColor: filterSeverity === sev ? `${sev === 'all' ? c.accent : SEVERITY_COLORS[sev]}22` : 'transparent',
                color: filterSeverity === sev ? (sev === 'all' ? c.accent : SEVERITY_COLORS[sev]) : c.textFaint,
                cursor: 'pointer',
                fontSize: '9px',
              }}
            >
              {sev === 'all' ? 'All' : SEVERITY_LABELS[sev]}
            </button>
          ))}
        </div>
      )}

      {/* Issue list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredIssues.map(issue => (
          <div
            key={issue.id}
            style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${c.borderSubtle}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                <span style={{
                  fontSize: '9px',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  backgroundColor: `${SEVERITY_COLORS[issue.severity]}22`,
                  color: SEVERITY_COLORS[issue.severity],
                  fontWeight: 600,
                }}>
                  {SEVERITY_LABELS[issue.severity]}
                </span>
                <span style={{ fontSize: '11px', color: c.text, fontWeight: 500 }}>{issue.message}</span>
              </div>
              <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '2px', background: c.surface, color: c.textMuted, flexShrink: 0 }}>
                {issue.rule}
              </span>
            </div>
            <div
              onClick={() => onNavigateTo?.(issue.file, issue.line)}
              style={{ fontSize: '9px', color: c.textFaint, cursor: 'pointer', marginBottom: '4px' }}
            >
              {issue.file.replace(cwd + '/', '')}:{issue.line}
            </div>
            <pre style={{
              margin: 0,
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
              {issue.code}
            </pre>
          </div>
        ))}

        {/* Empty state */}
        {issues.length === 0 && !isScanning && (
          <div style={{ padding: '16px 12px', color: c.textFaint, fontSize: '11px', textAlign: 'center' }}>
            {error ? 'Scan error' : 'Click "Scan" to detect security vulnerabilities'}
          </div>
        )}

        {/* Scanning */}
        {isScanning && (
          <div style={{ padding: '16px 12px', color: c.textMuted, fontSize: '11px', textAlign: 'center' }}>
            Scanning...
          </div>
        )}
      </div>
    </div>
  )
}

export default SecurityAuditPanel
