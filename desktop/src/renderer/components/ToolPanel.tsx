/**
 * 工具面板组件 - 显示可用工具列表、执行工具、查看结果
 */

import React, { useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import { ToolResultRenderer } from './MarkdownRenderer.js'

interface ToolPanelProps {
  cwd: string
  theme: ThemeColors
}

export function ToolPanel({ cwd, theme }: ToolPanelProps): React.JSX.Element {
  const c = theme
  const [tools, setTools] = useState<Array<{ name: string; description: string; input_schema: Record<string, unknown> }>>([])
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [toolInput, setToolInput] = useState('')
  const [toolResult, setToolResult] = useState<{ success: boolean; output?: unknown; error?: string } | null>(null)
  const [executing, setExecuting] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{ tool: string; input: Record<string, unknown> } | null>(null)
  const [confirmResolve, setConfirmResolve] = useState<(v: boolean) => void>(() => {})

  useEffect(() => {
    async function load() {
      try {
        const result = await window.dogeAPI.getTools()
        setTools(result)
      } catch { /* ignore */ }
    }
    load()
  }, [])

  const selectedToolDef = tools.find(t => t.name === selectedTool)

  const requestConfirm = (tool: string, input: Record<string, unknown>): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPendingConfirm({ tool, input })
      setConfirmResolve(() => resolve)
    })
  }

  const handleExecute = async () => {
    if (!selectedTool) return
    let input: Record<string, unknown> = {}
    try {
      input = JSON.parse(toolInput)
    } catch {
      alert('输入参数必须是有效的 JSON 格式')
      return
    }

    const dangerous = ['BashTool', 'HttpTool', 'FileWriteTool', 'FileEditTool']
    if (dangerous.includes(selectedTool)) {
      const confirmed = await requestConfirm(selectedTool, input)
      if (!confirmed) return
    }

    setExecuting(true)
    setToolResult(null)
    try {
      const result = await window.dogeAPI.executeTool({ name: selectedTool, input })
      setToolResult(result)
    } catch (e) {
      setToolResult({ success: false, error: e instanceof Error ? e.message : '执行失败' })
    } finally {
      setExecuting(false)
    }
  }

  if (tools.length === 0) {
    return <div style={{ padding: '8px 12px', color: c.textFaint, fontSize: '11px' }}>加载中...</div>
  }

  return (
    <div style={{ fontSize: '11px', position: 'relative' }}>
      {pendingConfirm && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: `${c.bg}99`, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
          <div style={{ background: c.surface, border: `1px solid ${c.errorBorder}`, borderRadius: '6px', padding: '16px', maxWidth: '420px', width: '90%', boxShadow: `0 8px 32px ${c.errorBorder}40` }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: c.errorText, marginBottom: '8px' }}> 工具执行确认</div>
            <div style={{ fontSize: '12px', color: c.text, marginBottom: '6px' }}>
              工具 <code style={{ background: c.bgPanel, padding: '1px 6px', borderRadius: '3px', color: c.accent }}>{pendingConfirm.tool}</code> 可能修改系统状态。
            </div>
            <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '12px', maxHeight: '120px', overflowY: 'auto', background: c.bgPanel, padding: '6px 8px', borderRadius: '4px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(pendingConfirm.input, null, 2)}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { confirmResolve(false); setPendingConfirm(null) }} style={{ padding: '5px 14px', border: `1px solid ${c.border}`, borderRadius: '4px', background: c.bgPanel, color: c.textMuted, cursor: 'pointer', fontSize: '12px' }}>取消</button>
              <button onClick={() => { confirmResolve(true); setPendingConfirm(null) }} style={{ padding: '5px 14px', border: 'none', borderRadius: '4px', background: c.errorText, color: '#000', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>确认执行</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ padding: '4px 12px', display: 'flex', gap: '4px', flexWrap: 'wrap', borderBottom: `1px solid ${c.borderSubtle}` }}>
        {tools.map(tool => (
          <button
            key={tool.name}
            onClick={() => { setSelectedTool(tool.name); setToolInput(''); setToolResult(null) }}
            style={{
              padding: '2px 8px', border: '1px solid', borderColor: selectedTool === tool.name ? c.accent : c.border,
              borderRadius: '3px', background: selectedTool === tool.name ? c.accentDim : c.bgPanel,
              color: selectedTool === tool.name ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px'
            }}
          >
            {tool.name}
          </button>
        ))}
      </div>

      {selectedToolDef && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}` }}>
          <div style={{ color: c.textMuted, marginBottom: '4px', fontSize: '10px' }}>{selectedToolDef.description}</div>
          <textarea
            value={toolInput}
            onChange={(e) => setToolInput(e.target.value)}
            placeholder={`输入 JSON 参数，例如: {"command": "ls -la"}`}
            style={{ width: '100%', minHeight: '60px', backgroundColor: c.bgPanel, border: `1px solid ${c.border}`, borderRadius: '4px', padding: '6px 8px', color: c.text, fontSize: '11px', fontFamily: 'monospace', outline: 'none', resize: 'vertical' }}
          />
          <button
            onClick={handleExecute}
            disabled={executing || !toolInput.trim()}
            style={{
              width: '100%', marginTop: '6px', padding: '5px', border: 'none', borderRadius: '4px', cursor: 'pointer',
              background: (!executing && toolInput.trim()) ? c.accent : c.borderSubtle,
              color: (!executing && toolInput.trim()) ? '#000' : c.textFaint,
              fontSize: '11px', fontWeight: 600
            }}
          >
            {executing ? '执行中...' : '执行'}
          </button>
        </div>
      )}

      {toolResult && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${c.border}` }}>
          <div style={{ fontSize: '10px', color: c.textMuted, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            执行结果
            {toolResult.success != null && (
              <span style={{
                fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '3px',
                background: toolResult.success ? c.accentDim : `${c.errorText}20`,
                color: toolResult.success ? c.accent : c.errorText,
              }}>
                {toolResult.success ? '✓ 成功' : '✗ 失败'}
              </span>
            )}
          </div>
          <ToolResultRenderer
            output={toolResult.output}
            error={toolResult.error}
            success={toolResult.success}
            maxHeight={200}
          />
        </div>
      )}
    </div>
  )
}
