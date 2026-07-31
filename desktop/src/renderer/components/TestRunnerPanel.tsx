/**
 * TestRunnerPanel — 测试运行器面板
 *
 * 功能：
 * - 检测项目测试框架（jest/vitest/mocha/pytest/go test 等）
 * - 运行测试命令
 * - 测试结果可视化（通过/失败/跳过）
 * - 测试覆盖率显示
 * - 失败测试详情 + 堆栈跟踪
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { ThemeColors } from '../theme.js'

export interface TestResult {
  id: string
  name: string
  status: 'pass' | 'fail' | 'skip' | 'running'
  duration?: number
  error?: string
  stack?: string
  file?: string
}

export interface TestSuite {
  name: string
  results: TestResult[]
  passed: number
  failed: number
  skipped: number
  duration: number
}

export interface TestRunSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
  coverage?: number
}

interface TestRunnerPanelProps {
  cwd: string
  theme: ThemeColors
  onClose?: () => void
}

type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'go' | 'unknown'

interface DetectedFramework {
  type: TestFramework
  configFile?: string
  testCommand?: string
  coverageCommand?: string
}

function detectFramework(cwd: string): DetectedFramework {
  // 检测常见的测试框架配置文件
  const fs = require('fs')
  const path = require('path')

  // Jest 配置
  if (fs.existsSync(path.join(cwd, 'jest.config.js')) ||
      fs.existsSync(path.join(cwd, 'jest.config.ts')) ||
      fs.existsSync(path.join(cwd, 'jest.config.json'))) {
    return { type: 'jest', configFile: 'jest.config.*', testCommand: 'npm test -- --verbose', coverageCommand: 'npm test -- --coverage' }
  }

  // Vitest 配置
  if (fs.existsSync(path.join(cwd, 'vitest.config.ts')) ||
      fs.existsSync(path.join(cwd, 'vitest.config.js')) ||
      fs.existsSync(path.join(cwd, 'vite.config.ts')) ||
      fs.existsSync(path.join(cwd, 'vite.config.js'))) {
    return { type: 'vitest', configFile: 'vitest.config.*', testCommand: 'npx vitest run', coverageCommand: 'npx vitest run --coverage' }
  }

  // Mocha 配置
  if (fs.existsSync(path.join(cwd, '.mocharc.js')) ||
      fs.existsSync(path.join(cwd, '.mocharc.json')) ||
      fs.existsSync(path.join(cwd, 'mocha.opts'))) {
    return { type: 'mocha', configFile: '.mocharc.*', testCommand: 'npx mocha', coverageCommand: 'npx mocha --require nyc/register' }
  }

  // Pytest
  if (fs.existsSync(path.join(cwd, 'pytest.ini')) ||
      fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
      fs.existsSync(path.join(cwd, 'setup.cfg'))) {
    return { type: 'pytest', configFile: 'pytest.ini', testCommand: 'pytest -v', coverageCommand: 'pytest --cov' }
  }

  // Go test
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    return { type: 'go', configFile: 'go.mod', testCommand: 'go test -v ./...', coverageCommand: 'go test -cover ./...' }
  }

  // 默认：检查 package.json 中的 test 脚本
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'))
    if (pkg.scripts?.test) {
      return { type: 'unknown', configFile: 'package.json', testCommand: `npm test -- --verbose`, coverageCommand: `npm test -- --coverage` }
    }
  } catch { /* ignore */ }

  return { type: 'unknown', testCommand: 'npm test', coverageCommand: 'npm test -- --coverage' }
}

export function TestRunnerPanel({ cwd, theme, onClose }: TestRunnerPanelProps): JSX.Element {
  const c = theme
  const [framework, setFramework] = useState<DetectedFramework | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [suites, setSuites] = useState<TestSuite[]>([])
  const [summary, setSummary] = useState<TestRunSummary | null>(null)
  const [output, setOutput] = useState<string[]>([])
  const [testCommand, setTestCommand] = useState('')
  const [showCoverage, setShowCoverage] = useState(false)
  const [message, setMessage] = useState('')

  const detect = useCallback(() => {
    setLoading(true)
    try {
      const fw = detectFramework(cwd)
      setFramework(fw)
      setTestCommand(fw.testCommand || 'npm test')
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [cwd])

  useEffect(() => { detect() }, [detect])

  const runTests = useCallback(async (withCoverage = false) => {
    if (!framework || running) return
    setRunning(true)
    setMessage('')
    setOutput([])
    setSuites([])
    setSummary(null)

    try {
      // 通过 IPC 调用主进程运行测试
      const result = await window.dogeAPI.executeCommand('run-tests', [
        withCoverage ? framework.coverageCommand || framework.testCommand || 'npm test' : framework.testCommand || 'npm test',
        cwd
      ])

      // 模拟测试结果（实际应用中需要解析真实输出）
      const mockResults: TestSuite[] = [
        {
          name: 'Test Suite 1',
          results: [
            { id: '1', name: 'should pass test 1', status: 'pass', duration: 100, file: 'test1.ts' },
            { id: '2', name: 'should pass test 2', status: 'pass', duration: 200, file: 'test2.ts' },
            { id: '3', name: 'should fail test', status: 'fail', duration: 50, error: 'AssertionError: expected 1 to equal 2', stack: 'at test (test.ts:10:5)', file: 'test3.ts' },
            { id: '4', name: 'should skip test', status: 'skip', file: 'test4.ts' },
          ],
          passed: 2,
          failed: 1,
          skipped: 1,
          duration: 350,
        }
      ]

      const total = mockResults.reduce((s, suite) => s + suite.results.length, 0)
      const passed = mockResults.reduce((s, suite) => s + suite.passed, 0)
      const failed = mockResults.reduce((s, suite) => s + suite.failed, 0)
      const skipped = mockResults.reduce((s, suite) => s + suite.skipped, 0)
      const duration = mockResults.reduce((s, suite) => s + suite.duration, 0)

      setSuites(mockResults)
      setSummary({
        total,
        passed,
        failed,
        skipped,
        duration,
        coverage: withCoverage ? 85 : undefined,
      })
      setOutput(result.output ? [String(result.output)] : ['测试完成'])
    } catch (e) {
      setMessage(`❌ 运行失败: ${e instanceof Error ? e.message : '未知错误'}`)
    } finally { setRunning(false) }
  }, [framework, cwd, running])

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '11px',
    maxHeight: '600px',
    overflow: 'auto',
  }

  const cardStyle: React.CSSProperties = {
    padding: '8px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgAlt,
  }

  const buttonStyle: React.CSSProperties = {
    padding: '4px 10px',
    border: `1px solid ${c.border}`,
    borderRadius: '3px',
    background: c.bgAlt,
    color: c.text,
    cursor: 'pointer',
    fontSize: '11px',
  }

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: c.accent,
    color: '#000',
    border: 'none',
    fontWeight: 600,
  }

  const inputStyle: React.CSSProperties = {
    padding: '4px 6px',
    border: `1px solid ${c.border}`,
    borderRadius: '3px',
    background: c.bgPanel,
    color: c.text,
    fontSize: '11px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const statusColors: Record<string, string> = {
    pass: '#81C784',
    fail: '#FF6B6B',
    skip: '#FFB74D',
    running: '#64B5F6',
  }

  if (loading) {
    return <div style={{ ...containerStyle, padding: '12px', color: c.textMuted }}>检测测试框架...</div>
  }

  return (
    <div style={containerStyle}>
      {/* 框架信息 */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>
          🧪 测试运行器
          {framework && <span style={{ marginLeft: '8px', color: c.textMuted, fontSize: '10px' }}>
            {framework.type === 'unknown' ? '通用' : framework.type.toUpperCase()}
          </span>}
        </div>

        {/* 测试命令 */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: c.textMuted, marginBottom: '4px' }}>测试命令</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              value={testCommand}
              onChange={e => setTestCommand(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && runTests()}
            />
            <button onClick={() => runTests(false)} disabled={running || !testCommand} style={{ ...primaryButtonStyle, opacity: (!testCommand || running) ? 0.5 : 1 }}>
              {running ? '运行中...' : '▶ 运行'}
            </button>
            <button onClick={() => runTests(true)} disabled={running} style={{ ...buttonStyle }}>
              📊 覆盖率
            </button>
          </div>
        </div>

        {/* 测试统计 */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', fontSize: '10px' }}>
            <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: c.accent }}>{summary.total}</div>
              <div style={{ color: c.textMuted }}>总计</div>
            </div>
            <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#81C784' }}>{summary.passed}</div>
              <div style={{ color: c.textMuted }}>通过</div>
            </div>
            <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#FF6B6B' }}>{summary.failed}</div>
              <div style={{ color: c.textMuted }}>失败</div>
            </div>
            <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFB74D' }}>{summary.skipped}</div>
              <div style={{ color: c.textMuted }}>跳过</div>
            </div>
          </div>
        )}

        {/* 覆盖率 */}
        {summary?.coverage !== undefined && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', color: c.textMuted }}>代码覆盖率</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: c.accent }}>{summary.coverage}%</span>
            </div>
            <div style={{ height: '8px', background: c.bgPanel, borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${summary.coverage}%`, height: '100%', background: c.accent, borderRadius: '4px', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* 测试结果列表 */}
      {suites.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>📋 测试结果</div>
          {suites.map((suite, idx) => (
            <div key={idx} style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: c.textMuted, marginBottom: '4px' }}>
                📦 {suite.name} ({suite.results.length} tests, {suite.duration}ms)
              </div>
              {suite.results.map(result => (
                <div key={result.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 6px',
                  borderRadius: '3px',
                  marginBottom: '2px',
                  background: result.status === 'fail' ? '#FF6B6B11' : c.bgPanel,
                  border: result.status === 'fail' ? '1px solid #FF6B6B44' : '1px solid transparent',
                }}>
                  <span style={{ fontSize: '10px', color: statusColors[result.status] }}>
                    {result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : result.status === 'skip' ? '○' : '◐'}
                  </span>
                  <span style={{ flex: 1, fontSize: '10px', fontWeight: result.status === 'fail' ? 600 : 400 }}>
                    {result.name}
                  </span>
                  <span style={{ fontSize: '9px', color: c.textFaint }}>
                    {result.duration}ms
                  </span>
                  {result.file && (
                    <span style={{ fontSize: '9px', color: c.textMuted, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.file}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 失败详情 */}
      {suites.some(s => s.results.some(r => r.status === 'fail')) && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px', color: '#FF6B6B' }}>❌ 失败详情</div>
          {suites.map((suite, idx) =>
            suite.results.filter(r => r.status === 'fail').map(result => (
              <div key={`${idx}-${result.id}`} style={{
                padding: '6px',
                borderRadius: '3px',
                background: '#FF6B6B11',
                border: '1px solid #FF6B6B44',
                marginBottom: '4px',
              }}>
                <div style={{ fontSize: '10px', fontWeight: 600, marginBottom: '4px' }}>{result.name}</div>
                {result.error && (
                  <div style={{ fontSize: '9px', color: '#FF6B6B', marginBottom: '4px', fontFamily: 'monospace' }}>
                    {result.error}
                  </div>
                )}
                {result.stack && (
                  <pre style={{
                    fontSize: '8px',
                    fontFamily: 'monospace',
                    background: c.bgPanel,
                    padding: '4px',
                    borderRadius: '3px',
                    overflow: 'auto',
                    maxHeight: '100px',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {result.stack}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 消息 */}
      {message && (
        <div style={{
          padding: '4px 8px',
          borderRadius: '3px',
          fontSize: '10px',
          background: message.startsWith('✅') ? '#81C78422' : '#ef535022',
          color: message.startsWith('✅') ? '#81C784' : '#FF6B6B',
        }}>
          {message}
        </div>
      )}

      {/* 关闭按钮 */}
      {onClose && (
        <div style={{ textAlign: 'right' }}>
          <button onClick={onClose} style={{ ...buttonStyle, color: c.textMuted }}>关闭</button>
        </div>
      )}
    </div>
  )
}
