/**
 * AgentPanel — 多 Agent 协作管理面板
 *
 * 支持：
 * - 列出已保存的 Agent 配置
 * - 创建/编辑/删除 Agent
 * - 选择活跃 Agent 执行任务
 */

import React, { useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface AgentConfig {
  id: string
  name: string
  description: string
  model: string
  systemPrompt?: string
  tools?: string[]
}

interface AgentPanelProps {
  cwd: string
  theme: ThemeColors
  onClose: () => void
  onSelectAgent?: (agent: AgentConfig) => void
  activeAgentId?: string | null
}

export function AgentPanel({ cwd, theme, onClose, onSelectAgent, activeAgentId }: AgentPanelProps): JSX.Element {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AgentConfig | null>(null)
  const [showForm, setShowForm] = useState(false)

  const loadAgents = async () => {
    try {
      const list = await window.dogeAPI.agentList()
      setAgents(list)
    } catch {
      setAgents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAgents() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此 Agent 吗？')) return
    const result = await window.dogeAPI.agentDelete(id)
    if (result.success) setAgents(prev => prev.filter(a => a.id !== id))
    else alert(result.error || '删除失败')
  }

  const handleSelect = (agent: AgentConfig) => {
    onSelectAgent?.(agent)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '560px', maxHeight: '600px', background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: '8px', boxShadow: `0 8px 32px ${theme.bg}80`, display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${theme.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>🤖 Agent 管理</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { setEditing(null); setShowForm(true) }}
              style={{
                padding: '3px 10px', border: `1px solid ${theme.accent}`, borderRadius: '3px',
                background: theme.accentDim, color: theme.accent, cursor: 'pointer',
                fontSize: '11px', fontWeight: 600,
              }}
            >
              + 新建
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '3px 8px', border: `1px solid ${theme.border}`, borderRadius: '3px',
                background: theme.bgPanel, color: theme.textMuted, cursor: 'pointer', fontSize: '11px',
              }}
            >
              关闭
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: '24px', color: theme.textFaint, textAlign: 'center', fontSize: '12px' }}>加载中...</div>
          ) : showForm ? (
            <AgentForm
              agent={editing}
              theme={theme}
              onSave={async (agent) => {
                const result = await window.dogeAPI.agentSave(agent as unknown as Record<string, unknown>)
                if (result.success) {
                  setShowForm(false)
                  loadAgents()
                } else {
                  alert(result.error || '保存失败')
                }
              }}
              onCancel={() => setShowForm(false)}
            />
          ) : agents.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: theme.textFaint, marginBottom: '8px' }}>暂无 Agent 配置</div>
              <div style={{ fontSize: '11px', color: theme.textFaint }}>点击「+ 新建」创建第一个 Agent</div>
            </div>
          ) : (
            agents.map(agent => (
              <div
                key={agent.id}
                style={{
                  padding: '10px 16px', borderBottom: `1px solid ${theme.borderSubtle}`,
                  background: activeAgentId === agent.id ? theme.accentDim : 'transparent',
                  cursor: 'pointer',
                }}
                onClick={() => handleSelect(agent)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🤖</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px', fontWeight: 600,
                      color: activeAgentId === agent.id ? theme.accent : theme.text,
                    }}>
                      {agent.name}
                    </div>
                    {agent.description && (
                      <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {agent.description}
                      </div>
                    )}
                    <div style={{ fontSize: '9px', color: theme.textFaint, marginTop: '2px' }}>
                      模型: {agent.model || '默认'}
                      {agent.tools && agent.tools.length > 0 && ` · ${agent.tools.length} 个工具`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing(agent); setShowForm(true) }}
                      style={{
                        padding: '2px 6px', border: `1px solid ${theme.border}`, borderRadius: '3px',
                        background: theme.bgPanel, color: theme.textMuted, cursor: 'pointer', fontSize: '10px',
                      }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(agent.id) }}
                      style={{
                        padding: '2px 6px', border: `1px solid ${theme.border}`, borderRadius: '3px',
                        background: theme.bgPanel, color: theme.errorText, cursor: 'pointer', fontSize: '10px',
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Agent 表单 ───
interface AgentFormProps {
  agent: AgentConfig | null
  theme: ThemeColors
  onSave: (agent: AgentConfig) => void
  onCancel: () => void
}

function AgentForm({ agent, theme, onSave, onCancel }: AgentFormProps): JSX.Element {
  const c = theme
  const [name, setName] = useState(agent?.name || '')
  const [description, setDescription] = useState(agent?.description || '')
  const [model, setModel] = useState(agent?.model || 'gpt-4o')
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || '')
  const [toolsStr, setToolsStr] = useState(agent?.tools?.join(', ') || '')

  const handleSubmit = () => {
    if (!name.trim()) {
      alert('请输入 Agent 名称')
      return
    }
    onSave({
      id: agent?.id || `agent-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      model: model.trim(),
      systemPrompt: systemPrompt.trim(),
      tools: toolsStr.split(',').map(t => t.trim()).filter(Boolean),
    })
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: theme.textFaint, marginBottom: '3px' }}>名称 *</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="代码审查助手"
          style={{
            width: '100%', padding: '6px 8px', background: theme.bgPanel,
            border: `1px solid ${theme.border}`, borderRadius: '3px', color: theme.text,
            fontSize: '11px', outline: 'none',
          }}
        />
      </div>
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: theme.textFaint, marginBottom: '3px' }}>描述</div>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="自动审查代码质量..."
          style={{
            width: '100%', padding: '6px 8px', background: theme.bgPanel,
            border: `1px solid ${theme.border}`, borderRadius: '3px', color: theme.text,
            fontSize: '11px', outline: 'none',
          }}
        />
      </div>
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: theme.textFaint, marginBottom: '3px' }}>模型</div>
        <input
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder="gpt-4o"
          style={{
            width: '100%', padding: '6px 8px', background: theme.bgPanel,
            border: `1px solid ${theme.border}`, borderRadius: '3px', color: theme.text,
            fontSize: '11px', outline: 'none',
          }}
        />
      </div>
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: theme.textFaint, marginBottom: '3px' }}>系统提示词</div>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="你是一个专业的代码审查助手..."
          rows={4}
          style={{
            width: '100%', padding: '6px 8px', background: theme.bgPanel,
            border: `1px solid ${theme.border}`, borderRadius: '3px', color: theme.text,
            fontSize: '11px', outline: 'none', resize: 'vertical',
          }}
        />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', color: theme.textFaint, marginBottom: '3px' }}>工具（逗号分隔）</div>
        <input
          value={toolsStr}
          onChange={e => setToolsStr(e.target.value)}
          placeholder="BashTool, FileReadTool, FileWriteTool"
          style={{
            width: '100%', padding: '6px 8px', background: theme.bgPanel,
            border: `1px solid ${theme.border}`, borderRadius: '3px', color: theme.text,
            fontSize: '11px', outline: 'none',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleSubmit}
          style={{
            flex: 1, padding: '6px', border: 'none', borderRadius: '3px',
            background: theme.accent, color: '#000', cursor: 'pointer',
            fontSize: '11px', fontWeight: 600,
          }}
        >
          保存
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '6px', border: `1px solid ${theme.border}`, borderRadius: '3px',
            background: theme.bgPanel, color: theme.textMuted, cursor: 'pointer', fontSize: '11px',
          }}
        >
          取消
        </button>
      </div>
    </div>
  )
}
