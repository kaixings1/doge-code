/**
 * AgentPanel — 多 Agent 协作管理面板
 *
 * 支持：
 * - 列出已保存的 Agent 配置
 * - 创建/编辑/删除 Agent
 * - 选择活跃 Agent 执行任务
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  const [view, setView] = useState<'config' | 'orchestrate'>('config')

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
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              onClick={() => setView('config')}
              style={{
                padding: '3px 8px', border: 'none', borderRadius: '3px',
                background: view === 'config' ? theme.accentDim : 'transparent',
                color: view === 'config' ? theme.accent : theme.textMuted,
                cursor: 'pointer', fontSize: '11px', fontWeight: view === 'config' ? 600 : 400,
              }}
            >
              配置
            </button>
            <button
              onClick={() => setView('orchestrate')}
              style={{
                padding: '3px 8px', border: 'none', borderRadius: '3px',
                background: view === 'orchestrate' ? theme.accentDim : 'transparent',
                color: view === 'orchestrate' ? theme.accent : theme.textMuted,
                cursor: 'pointer', fontSize: '11px', fontWeight: view === 'orchestrate' ? 600 : 400,
              }}
            >
              ⚔ 军团编排
            </button>
            {view === 'config' && (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* 内容 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {view === 'orchestrate' ? (
            <OrchestrationView theme={theme} onOrchestrated={() => {}} />
          ) : loading ? (
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

// ─── 军团编排视图（多 Agent 并行 + 进度 + 结果聚合） ───

interface BuiltinRole {
  id: string
  name: string
  description?: string
  systemPrompt: string
  model?: string
}

interface AgentOutputItem {
  roleId: string
  name: string
  content: string
  durationMs: number
  status: 'completed' | 'failed' | 'cancelled' | 'timeout'
  error?: string
  inputTokens: number
  outputTokens: number
}

interface OrchestrationViewProps {
  theme: ThemeColors
  onOrchestrated?: (outputs: AgentOutputItem[]) => void
}

function OrchestrationView({ theme, onOrchestrated }: OrchestrationViewProps): JSX.Element {
  const c = theme
  const [roles, setRoles] = useState<BuiltinRole[]>([])
  const [task, setTask] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [orchId, setOrchId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ completedCount: number; totalCount: number; runningRoles: string[]; status: string } | null>(null)
  const [outputs, setOutputs] = useState<AgentOutputItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [defaultModel, setDefaultModel] = useState('')
  const [discussMode, setDiscussMode] = useState(false)
  const [maxRounds, setMaxRounds] = useState(3)
  const [round1Outputs, setRound1Outputs] = useState<AgentOutputItem[]>([])
  const [roundsUsed, setRoundsUsed] = useState<number | null>(null)
  const [exportPath, setExportPath] = useState<string | null>(null)
  const [compareRoleId, setCompareRoleId] = useState<string | null>(null)
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; description?: string; task: string; mode: string; maxRounds?: number; roleIds: string[] }>>([])
  const [showWorkflows, setShowWorkflows] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [consensus, setConsensus] = useState<{ consensusPoints: Array<{ text: string; agents: string[] }>; divergencePoints: Array<{ text: string; agent: string }>; agentStats: Array<{ name: string; sentenceCount: number; chars: number; consensusHits: number }> } | null>(null)
  const [showConsensus, setShowConsensus] = useState(false)
  // 结果收藏（localStorage 持久化）
  const FAVORITES_KEY = 'doge-agent-favorites'
  const [favorites, setFavorites] = useState<Array<{ id: string; name: string; roleId: string; content: string; task: string; favoritedAt: number }>>([])
  const [showFavorites, setShowFavorites] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)

  // 加载内置角色
  useEffect(() => {
    const api = window.dogeAPI as Record<string, any>
    void api?.agentListRoles?.().then((res: any) => {
      if (res?.success && res.roles) {
        setRoles(res.roles)
        setSelected(new Set(res.roles.map((r: BuiltinRole) => r.id)))
      }
    })
    void api?.getModelInfo?.().then((info: any) => {
      if (info?.model) setDefaultModel(info.model)
    })
    // 订阅进度事件
    if (typeof api?.onAgentProgress === 'function') {
      unsubRef.current = api.onAgentProgress((p: { completedCount: number; totalCount: number; runningRoles: string[]; status: string }) => {
        setProgress(p)
      })
    }
    // 加载已保存的工作流
    void api?.agentWorkflowList?.().then((res: any) => {
      if (res?.success && res.workflows) setWorkflows(res.workflows)
    })
    // 加载收藏
    try {
      const saved = localStorage.getItem(FAVORITES_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setFavorites(parsed)
      }
    } catch { /* ignore */ }
    return () => { unsubRef.current?.() }
  }, [])

  const saveFavorites = useCallback((items: typeof favorites) => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(items.slice(0, 30)))
    } catch { /* ignore */ }
    setFavorites(items.slice(0, 30))
  }, [])

  // 收藏/取消收藏某条结果
  const toggleFavorite = useCallback((out: AgentOutputItem) => {
    setFavorites(prev => {
      const existing = prev.find(f => f.roleId === out.roleId && f.content === out.content)
      if (existing) {
        const next = prev.filter(f => f.id !== existing.id)
        saveFavorites(next)
        return next
      }
      const next = [{ id: `fav-${Date.now()}-${out.roleId}`, name: out.name, roleId: out.roleId, content: out.content, task: task.trim(), favoritedAt: Date.now() }, ...prev]
      saveFavorites(next)
      return next
    })
  }, [task, saveFavorites])

  const isFavorite = useCallback((out: AgentOutputItem): boolean => {
    return favorites.some(f => f.roleId === out.roleId && f.content === out.content)
  }, [favorites])

  const toggleRole = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleStart = useCallback(async () => {
    if (!task.trim()) { setError('请输入任务描述'); return }
    const activeRoles = roles.filter(r => selected.has(r.id))
    if (activeRoles.length === 0) { setError('请至少选择一个 Agent 角色'); return }
    setError(null)
    setRunning(true)
    setOutputs([])
    setRound1Outputs([])
    setProgress(null)
    try {
      const api = window.dogeAPI as Record<string, any>
      const orchParams: Record<string, unknown> = {
        task: task.trim(),
        roles: activeRoles,
        defaultModel: defaultModel || 'gpt-4o',
        timeoutMs: 180000,
        mode: discussMode ? 'discuss' : 'parallel',
      }
      if (discussMode) orchParams.maxRounds = maxRounds
      const res = await api?.agentOrchestrate?.(orchParams)
      if (res?.success && res.result) {
        const r = res.result
        setOutputs(r.outputs || [])
        if (discussMode && r.round1Outputs) setRound1Outputs(r.round1Outputs)
        if (discussMode && r.roundsUsed) setRoundsUsed(r.roundsUsed)
        onOrchestrated?.(r.outputs || [])
        if (r.status === 'cancelled') setError('编排已取消')
      } else {
        setError(res?.error || '编排失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '编排请求失败')
    } finally {
      setRunning(false)
    }
  }, [task, roles, selected, defaultModel, onOrchestrated, discussMode, maxRounds])

  const handleCancel = useCallback(async () => {
    if (!orchId) return
    const api = window.dogeAPI as Record<string, any>
    await api?.agentCancel?.(orchId)
  }, [orchId])

  // 保存当前编排为工作流
  const handleSaveWorkflow = useCallback(async () => {
    if (!saveName.trim()) { setError('请输入工作流名称'); return }
    const activeRoleIds = roles.filter(r => selected.has(r.id)).map(r => r.id)
    if (activeRoleIds.length === 0) { setError('请至少选择一个 Agent 角色'); return }
    try {
      const api = window.dogeAPI as Record<string, any>
      const res = await api?.agentWorkflowSave?.({
        name: saveName.trim(),
        description: `保存于 ${new Date().toLocaleString()}`,
        task: task.trim(),
        mode: discussMode ? 'discuss' : 'parallel',
        maxRounds: discussMode ? maxRounds : 3,
        roleIds: activeRoleIds,
      })
      if (res?.success) {
        setShowSaveInput(false)
        setSaveName('')
        const listRes = await api?.agentWorkflowList?.()
        if (listRes?.success && listRes.workflows) setWorkflows(listRes.workflows)
        setError(null)
      } else {
        setError(res?.error || '保存失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    }
  }, [saveName, task, roles, selected, discussMode, maxRounds])

  // 加载工作流到当前配置
  const handleLoadWorkflow = useCallback((wf: { task: string; mode: string; maxRounds?: number; roleIds: string[] }) => {
    setTask(wf.task || '')
    setDiscussMode(wf.mode === 'discuss')
    if (wf.maxRounds) setMaxRounds(wf.maxRounds)
    setSelected(new Set(wf.roleIds || []))
    setShowWorkflows(false)
  }, [])

  // 删除工作流
  const handleDeleteWorkflow = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除此工作流？')) return
    try {
      const api = window.dogeAPI as Record<string, any>
      await api?.agentWorkflowDelete?.(id)
      const listRes = await api?.agentWorkflowList?.()
      if (listRes?.success && listRes.workflows) setWorkflows(listRes.workflows)
    } catch { /* ignore */ }
  }, [])

  // 导出编排结果为 Markdown 报告
  const handleExportReport = useCallback(async () => {
    if (outputs.length === 0) return
    try {
      const api = window.dogeAPI as Record<string, any>
      const reportParams: Record<string, unknown> = {
        task: task.trim(),
        mode: discussMode ? 'discuss' : 'parallel',
        outputs: outputs.map(o => ({ name: o.name, roleId: o.roleId, content: o.content, status: o.status, durationMs: o.durationMs, error: o.error })),
      }
      if (roundsUsed) reportParams.roundsUsed = roundsUsed
      const res = await api?.agentExportReport?.(reportParams)
      if (res?.success) {
        setError(null)
        setExportPath(res.path || '')
      } else {
        setError(res?.error || '导出失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败')
    }
  }, [outputs, task, discussMode, roundsUsed])

  const statusColor = (s: string): string =>
    s === 'completed' ? '#10b981' : s === 'failed' || s === 'timeout' ? '#ef4444' : s === 'cancelled' ? '#f59e0b' : c.textFaint

  const statusText = (s: string): string =>
    s === 'completed' ? '完成' : s === 'failed' ? '失败' : s === 'timeout' ? '超时' : s === 'cancelled' ? '取消' : '未知'

  // 共识/分歧分析：对多个 Agent 结果做轻量文本分析（句子切分 + 归一化 + 跨 Agent 交集）
  const handleConsensusAnalysis = useCallback(() => {
    const completed = outputs.filter(o => o.status === 'completed' && o.content && o.content.trim())
    if (completed.length < 2) {
      setError('至少需要 2 个成功完成的 Agent 结果才能做共识分析')
      return
    }
    const normalize = (s: string): string => s.replace(/[\s\u3000]/g, '').replace(/[，。！？、；：""''（）()【】\[\]·,.;:!?'"\-—_]/g, '').toLowerCase()
    const splitSentences = (text: string): string[] => {
      // 按换行/句末标点切分，过滤过短片段
      return text
        .split(/\n+|(?<=[。！？；.!?])/u)
        .map(s => s.trim())
        .filter(s => s.length >= 4 && s.length <= 120)
    }
    interface Doc { name: string; sentences: string[]; normSet: Set<string> }
    const docs: Doc[] = completed.map(o => {
      const sentences = splitSentences(o.content)
      return { name: o.name, sentences, normSet: new Set(sentences.map(normalize)) }
    })
    // 共识点：某归一化句出现在 ≥2 个 Agent 中
    const sentenceAgents = new Map<string, string[]>()
    docs.forEach(doc => {
      doc.normSet.forEach(norm => {
        const arr = sentenceAgents.get(norm) || []
        if (!arr.includes(doc.name)) arr.push(doc.name)
        sentenceAgents.set(norm, arr)
      })
    })
    const consensusPoints: Array<{ text: string; agents: string[] }> = []
    for (const [norm, agents] of sentenceAgents.entries()) {
      if (agents.length >= 2) {
        const orig = docs.flatMap(d => d.sentences).find(s => normalize(s) === norm)
        consensusPoints.push({ text: orig || norm, agents })
      }
    }
    consensusPoints.sort((a, b) => b.agents.length - a.agents.length)
    // 分歧点：每个 Agent 独有的关键句（不在任何其他 Agent 中出现）
    const divergencePoints: Array<{ text: string; agent: string }> = []
    docs.forEach(doc => {
      doc.normSet.forEach(norm => {
        const shared = sentenceAgents.get(norm) || []
        if (shared.length === 1) {
          const orig = doc.sentences.find(s => normalize(s) === norm)
          if (orig) divergencePoints.push({ text: orig, agent: doc.name })
        }
      })
    })
    // 各 Agent 观点统计（可视化用）
    const agentStats = docs.map(doc => {
      let consensusHits = 0
      doc.normSet.forEach(norm => {
        if ((sentenceAgents.get(norm) || []).length >= 2) consensusHits++
      })
      return {
        name: doc.name,
        sentenceCount: doc.sentences.length,
        chars: doc.sentences.reduce((sum, s) => sum + s.length, 0),
        consensusHits,
      }
    })
    setConsensus({
      consensusPoints: consensusPoints.slice(0, 10),
      divergencePoints: divergencePoints.slice(0, 10),
      agentStats,
    })
    setShowConsensus(true)
    setError(null)
  }, [outputs])

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 角色选择 */}
      <div>
        <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '4px' }}>选择参与编排的 Agent 角色（并行执行）</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {roles.map(role => (
            <button
              key={role.id}
              onClick={() => toggleRole(role.id)}
              title={role.description}
              style={{
                padding: '3px 8px', border: `1px solid ${selected.has(role.id) ? c.accent : c.border}`,
                borderRadius: '3px', background: selected.has(role.id) ? c.accentDim : c.bgPanel,
                color: selected.has(role.id) ? c.accent : c.textMuted, cursor: 'pointer',
                fontSize: '10px', fontWeight: selected.has(role.id) ? 600 : 400,
              }}
            >
              {role.name}
            </button>
          ))}
        </div>
      </div>

      {/* 任务输入 */}
      <div>
        <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '4px' }}>任务（发给所有 Agent）</div>
        <textarea
          value={task}
          onChange={e => setTask(e.target.value)}
          placeholder="例如：分析 src/engine 的架构，找出性能瓶颈并给出重构方案"
          rows={3}
          style={{
            width: '100%', padding: '6px 8px', background: c.bgPanel,
            border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text,
            fontSize: '11px', outline: 'none', resize: 'vertical',
          }}
        />
      </div>

      {/* 工作流管理 */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowWorkflows(v => !v)}
          style={{
            padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
            background: showWorkflows ? c.accentDim : c.bgPanel, color: showWorkflows ? c.accent : c.textMuted,
            cursor: 'pointer', fontSize: '10px',
          }}
        >
          🗂 工作流 {workflows.length > 0 ? `(${workflows.length})` : ''}
        </button>
        <button
          onClick={() => { setShowSaveInput(v => !v); setSaveName('') }}
          style={{
            padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
            background: c.bgPanel, color: c.accent, cursor: 'pointer', fontSize: '10px',
          }}
        >
          💾 保存编排
        </button>
        {showSaveInput && (
          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="工作流名称"
              onKeyDown={e => { if (e.key === 'Enter') handleSaveWorkflow() }}
              style={{
                width: '110px', padding: '3px 6px', background: c.bgPanel, border: `1px solid ${c.border}`,
                borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none',
              }}
            />
            <button onClick={handleSaveWorkflow} style={{
              padding: '3px 8px', border: 'none', borderRadius: '3px',
              background: c.accent, color: '#000', cursor: 'pointer', fontSize: '10px', fontWeight: 600,
            }}>保存</button>
          </span>
        )}
      </div>

      {/* 工作流列表 */}
      {showWorkflows && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '120px', overflowY: 'auto' }}>
          {workflows.length === 0 ? (
            <div style={{ fontSize: '10px', color: c.textFaint, padding: '4px' }}>暂无已保存的工作流</div>
          ) : workflows.map(wf => (
            <div
              key={wf.id}
              onClick={() => handleLoadWorkflow(wf)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '4px 8px', border: `1px solid ${c.borderSubtle}`, borderRadius: '3px',
                background: c.bgPanel, cursor: 'pointer',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: c.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {wf.name}
                </div>
                <div style={{ fontSize: '9px', color: c.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {wf.mode === 'discuss' ? '🗣 讨论' : '⚡ 并行'} · {wf.roleIds.length} 角色 · {wf.maxRounds || 3} 轮
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteWorkflow(wf.id, e)}
                style={{
                  padding: '1px 5px', border: 'none', borderRadius: '2px', background: 'transparent',
                  color: c.errorText, cursor: 'pointer', fontSize: '10px', flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 模式选择 */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: c.textFaint }}>模式:</span>
        <button
          onClick={() => setDiscussMode(false)}
          style={{
            padding: '3px 8px', border: `1px solid ${!discussMode ? c.accent : c.border}`, borderRadius: '3px',
            background: !discussMode ? c.accentDim : c.bgPanel, color: !discussMode ? c.accent : c.textMuted,
            cursor: 'pointer', fontSize: '10px', fontWeight: !discussMode ? 600 : 400,
          }}
          title="各 Agent 独立并行分析"
        >
          ⚡ 并行
        </button>
        <button
          onClick={() => setDiscussMode(true)}
          style={{
            padding: '3px 8px', border: `1px solid ${discussMode ? c.accent : c.border}`, borderRadius: '3px',
            background: discussMode ? c.accentDim : c.bgPanel, color: discussMode ? c.accent : c.textMuted,
            cursor: 'pointer', fontSize: '10px', fontWeight: discussMode ? 600 : 400,
          }}
          title="多轮迭代：先独立分析，再逐轮交叉评审，直至收敛或达到最大轮数"
        >
          🗣 讨论模式
        </button>
        {discussMode && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
            <span style={{ fontSize: '10px', color: c.textFaint }}>轮数:</span>
            <input
              type="number"
              min={2}
              max={8}
              value={maxRounds}
              onChange={e => setMaxRounds(Math.max(2, Math.min(8, Number(e.target.value) || 3)))}
              style={{
                width: '40px', padding: '2px 4px', background: c.bgPanel, border: `1px solid ${c.border}`,
                borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none', textAlign: 'center',
              }}
            />
          </span>
        )}
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={handleStart}
          disabled={running}
          style={{
            flex: 1, padding: '6px', border: 'none', borderRadius: '3px',
            background: c.accent, color: '#000', cursor: running ? 'default' : 'pointer',
            fontSize: '11px', fontWeight: 600, opacity: running ? 0.6 : 1,
          }}
        >
          {running ? '⏳ 编排中...' : discussMode ? '🗣 发起讨论编排' : '⚔ 发起并行编排'}
        </button>
        {running && (
          <button
            onClick={handleCancel}
            style={{
              padding: '6px 12px', border: `1px solid ${c.border}`, borderRadius: '3px',
              background: c.bgPanel, color: c.errorText, cursor: 'pointer', fontSize: '11px',
            }}
          >
            取消
          </button>
        )}
      </div>

      {/* 进度 */}
      {progress && (
        <div style={{
          padding: '6px 8px', background: c.codeBg, borderRadius: '3px', fontSize: '10px', color: c.text,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{progress.status === 'running' ? '🔄 并行执行中' : '✅ 编排结束'}</span>
            <span style={{ color: c.textFaint }}>{progress.completedCount}/{progress.totalCount}</span>
          </div>
          {progress.runningRoles.length > 0 && (
            <div style={{ color: c.accent, marginTop: '2px' }}>进行中: {progress.runningRoles.join(', ')}</div>
          )}
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div style={{ padding: '5px 8px', background: c.errorBg, color: c.errorText, borderRadius: '3px', fontSize: '10px' }}>{error}</div>
      )}

      {/* 讨论模式第一轮结果 */}
      {round1Outputs.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '4px' }}>第 1 轮 · 独立分析（发散）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {round1Outputs.map(out => (
              <div key={`r1-${out.roleId}`} style={{ border: `1px solid ${c.borderSubtle}`, borderRadius: '3px', padding: '5px 8px', background: c.bgPanel }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ color: c.accent, fontSize: '10px', fontWeight: 600 }}>{out.name}</span>
                  <span style={{ color: statusColor(out.status), fontSize: '9px' }}>{statusText(out.status)}</span>
                </div>
                {out.error ? (
                  <div style={{ color: c.errorText, fontSize: '9px' }}>{out.error}</div>
                ) : (
                  <pre style={{ margin: 0, color: c.text, fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '80px', overflowY: 'auto' }}>{out.content}</pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 结果（最终结论） */}
      {outputs.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', color: c.textFaint, marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {discussMode ? `最终结论（共 ${roundsUsed ?? maxRounds} 轮${roundsUsed && roundsUsed < maxRounds ? '，已收敛提前结束' : ''}）` : `聚合结果（${outputs.length} 个 Agent）`}
            </span>
            <button
              onClick={handleExportReport}
              title="导出为 Markdown 报告到 .doge/reports/"
              style={{
                padding: '1px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                background: c.bgPanel, color: c.accent, cursor: 'pointer', fontSize: '9px',
              }}
            >
              📄 导出报告
            </button>
            <button
              onClick={() => { setShowFavorites(v => !v) }}
              title={`已收藏的 Agent 结果（${favorites.length} 条）`}
              style={{
                padding: '1px 8px', border: `1px solid ${showFavorites ? '#f59e0b' : c.border}`, borderRadius: '3px',
                background: showFavorites ? 'rgba(245,158,11,0.12)' : c.bgPanel,
                color: showFavorites ? '#f59e0b' : c.textMuted, cursor: 'pointer', fontSize: '9px',
              }}
            >
              ★ 收藏 {favorites.length > 0 ? `(${favorites.length})` : ''}
            </button>
            <button
              onClick={handleConsensusAnalysis}
              title="提取多 Agent 的共识点与分歧点（本地文本分析）"
              style={{
                padding: '1px 8px', border: `1px solid ${c.border}`, borderRadius: '3px',
                background: c.bgPanel, color: '#8b5cf6', cursor: 'pointer', fontSize: '9px',
              }}
            >
              🧠 共识分析
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {outputs.map(out => {
              const round1 = round1Outputs.find(o => o.roleId === out.roleId)
              const showCompare = discussMode && round1 && round1.status === 'completed' && round1.content.trim() !== out.content.trim()
              return (
                <div key={out.roleId} style={{
                  border: `1px solid ${c.borderSubtle}`, borderRadius: '3px', padding: '6px 8px', background: c.bgPanel,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <span style={{ color: c.accent, fontSize: '10px', fontWeight: 600 }}>{out.name}</span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        onClick={() => out.status === 'completed' && toggleFavorite(out)}
                        disabled={out.status !== 'completed'}
                        style={{
                          padding: '1px 6px', border: `1px solid ${isFavorite(out) ? '#f59e0b' : c.border}`, borderRadius: '2px',
                          background: isFavorite(out) ? 'rgba(245,158,11,0.12)' : 'transparent',
                          color: isFavorite(out) ? '#f59e0b' : c.textMuted,
                          cursor: out.status === 'completed' ? 'pointer' : 'default', fontSize: '9px', opacity: out.status === 'completed' ? 1 : 0.4,
                        }}
                        title={isFavorite(out) ? '取消收藏' : '收藏此结果（跨会话保留）'}
                      >
                        {isFavorite(out) ? '★ 已收藏' : '☆ 收藏'}
                      </button>
                      {showCompare && (
                        <button
                          onClick={() => setCompareRoleId(prev => prev === out.roleId ? null : out.roleId)}
                          style={{
                            padding: '1px 6px', border: `1px solid ${c.border}`, borderRadius: '2px',
                            background: compareRoleId === out.roleId ? c.accentDim : 'transparent',
                            color: c.accent, cursor: 'pointer', fontSize: '9px',
                          }}
                          title="对比第 1 轮观点（讨论如何演变）"
                        >
                          🔄 {compareRoleId === out.roleId ? '收起对比' : '对比第1轮'}
                        </button>
                      )}
                      <span style={{ color: statusColor(out.status), fontSize: '9px' }}>{statusText(out.status)}</span>
                      {out.status === 'completed' && (
                        <span style={{ color: c.textFaint, fontSize: '9px' }}>{((out.durationMs) / 1000).toFixed(1)}s · ⬆{out.inputTokens}/⬇{out.outputTokens}</span>
                      )}
                    </div>
                  </div>
                  {compareRoleId === out.roleId && round1 && (
                    <div style={{
                      marginBottom: '4px', padding: '4px 6px', borderLeft: `2px solid ${c.accent}`,
                      background: c.codeBg, borderRadius: '2px',
                    }}>
                      <div style={{ fontSize: '9px', color: c.textMuted, marginBottom: '2px' }}>📝 第 1 轮观点（讨论前）</div>
                      <pre style={{
                        margin: 0, color: c.textFaint, fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: '80px', overflowY: 'auto',
                      }}>{round1.content}</pre>
                    </div>
                  )}
                  {out.error ? (
                    <div style={{ color: c.errorText, fontSize: '9px' }}>{out.error}</div>
                  ) : (
                    <pre style={{
                      margin: 0, color: c.text, fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      maxHeight: '120px', overflowY: 'auto',
                    }}>{out.content}</pre>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 导出成功提示 */}
      {exportPath && (
        <div style={{
          padding: '5px 8px', background: 'rgba(16,185,129,0.1)', color: '#10b981',
          borderRadius: '3px', fontSize: '9px', wordBreak: 'break-all',
        }}>
          ✅ 报告已导出: {exportPath}
          <span style={{ marginLeft: '8px', cursor: 'pointer' }} onClick={() => setExportPath(null)}>✕</span>
        </div>
      )}

      {/* 共识/分歧分析 */}
      {consensus && showConsensus && (
        <div style={{ border: `1px solid #8b5cf655`, borderRadius: '3px', padding: '6px 8px', background: 'rgba(139,92,246,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', color: '#8b5cf6', fontWeight: 600 }}>🧠 共识/分歧分析</span>
            <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '9px', color: c.textMuted }}>{consensus.consensusPoints.length} 共识 · {consensus.divergencePoints.length} 分歧</span>
              <button
                onClick={() => setShowConsensus(false)}
                style={{ padding: '0 4px', border: 'none', background: 'transparent', color: c.textFaint, cursor: 'pointer', fontSize: '9px' }}
              >
                ✕
              </button>
            </span>
          </div>

          {/* 观点可视化：各 Agent 贡献度条形图 + 共识/分歧占比 */}
          {consensus.agentStats && consensus.agentStats.length > 0 && (
            <div style={{ marginBottom: '6px', padding: '4px 6px', background: c.codeBg, borderRadius: '3px' }}>
              <div style={{ fontSize: '9px', color: c.textMuted, marginBottom: '3px' }}>📊 观点贡献度（句子数，含共识命中）</div>
              {(() => {
                const maxSentences = Math.max(...consensus.agentStats.map(s => s.sentenceCount), 1)
                const totalConsensus = consensus.consensusPoints.length
                const totalDivergence = consensus.divergencePoints.length
                const totalPoints = totalConsensus + totalDivergence
                const consensusPct = totalPoints > 0 ? (totalConsensus / totalPoints) * 100 : 0
                return (
                  <>
                    {consensus.agentStats.map((s, i) => (
                      <div key={`astat-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '8px', color: c.textMuted, width: '72px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={s.name}>{s.name}</span>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', background: c.bgPanel, borderRadius: '2px', height: '10px', overflow: 'hidden' }}>
                          {/* 总句子数条（浅色） */}
                          <div style={{ width: `${(s.sentenceCount / maxSentences) * 100}%`, height: '100%', background: '#8b5cf655', borderRadius: '2px 0 0 2px', position: 'relative' }}>
                            {/* 共识命中部分（绿色覆盖） */}
                            {s.consensusHits > 0 && (
                              <div style={{ width: `${(s.consensusHits / s.sentenceCount) * 100}%`, height: '100%', background: '#10b98188' }} />
                            )}
                          </div>
                        </div>
                        <span style={{ fontSize: '8px', color: c.textFaint, width: '46px', textAlign: 'right', flexShrink: 0 }}>{s.sentenceCount}句 · {s.consensusHits}共识</span>
                      </div>
                    ))}
                    {totalPoints > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                        <span style={{ fontSize: '8px', color: c.textMuted, width: '72px', flexShrink: 0 }}>共识占比</span>
                        <div style={{ flex: 1, display: 'flex', height: '8px', borderRadius: '2px', overflow: 'hidden', background: '#f59e0b44' }}>
                          <div style={{ width: `${consensusPct}%`, background: '#10b981' }} title={`共识 ${totalConsensus}`} />
                          <div style={{ width: `${100 - consensusPct}%`, background: '#f59e0b' }} title={`分歧 ${totalDivergence}`} />
                        </div>
                        <span style={{ fontSize: '8px', color: c.textFaint, width: '46px', textAlign: 'right', flexShrink: 0 }}>
                          {totalConsensus}/{totalPoints}
                        </span>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {consensus.consensusPoints.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '9px', color: '#10b981', marginBottom: '2px' }}>✅ 共识点（多个 Agent 一致）</div>
              {consensus.consensusPoints.map((p, i) => (
                <div key={`c-${i}`} style={{ padding: '3px 4px', borderLeft: `2px solid #10b981`, background: c.codeBg, borderRadius: '2px', marginBottom: '2px' }}>
                  <div style={{ fontSize: '9px', color: c.text }}>{p.text}</div>
                  <div style={{ fontSize: '8px', color: '#10b981', marginTop: '1px' }}>共 {p.agents.length} 个 Agent: {p.agents.join('、')}</div>
                </div>
              ))}
            </div>
          )}

          {consensus.divergencePoints.length > 0 && (
            <div>
              <div style={{ fontSize: '9px', color: '#f59e0b', marginBottom: '2px' }}>⚡ 分歧点（单 Agent 独有观点）</div>
              {consensus.divergencePoints.map((p, i) => (
                <div key={`d-${i}`} style={{ padding: '3px 4px', borderLeft: `2px solid #f59e0b`, background: c.codeBg, borderRadius: '2px', marginBottom: '2px' }}>
                  <div style={{ fontSize: '9px', color: c.text }}>{p.text}</div>
                  <div style={{ fontSize: '8px', color: '#f59e0b', marginTop: '1px' }}>仅 {p.agent}</div>
                </div>
              ))}
            </div>
          )}

          {consensus.consensusPoints.length === 0 && consensus.divergencePoints.length === 0 && (
            <div style={{ fontSize: '9px', color: c.textFaint }}>未能提取出足够的句子级共识/分歧（结果可能过短或风格差异过大）</div>
          )}
        </div>
      )}

      {/* 收藏列表 */}
      {showFavorites && (
        <div style={{ border: `1px solid #f59e0b55`, borderRadius: '3px', padding: '6px 8px', background: 'rgba(245,158,11,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>★ 已收藏的 Agent 结果（{favorites.length}）</span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {favorites.length > 0 && (
                <button
                  onClick={() => { if (confirm('确定清空全部收藏？')) saveFavorites([]) }}
                  style={{ padding: '1px 6px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '9px' }}
                >
                  清空全部
                </button>
              )}
              <button
                onClick={() => setShowFavorites(false)}
                style={{ padding: '0 4px', border: 'none', background: 'transparent', color: c.textFaint, cursor: 'pointer', fontSize: '9px' }}
              >
                ✕
              </button>
            </div>
          </div>
          {favorites.length === 0 ? (
            <div style={{ fontSize: '9px', color: c.textFaint }}>暂无收藏 · 点击结果卡片上的 ☆ 收藏按钮保存重要输出</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
              {favorites.map(f => (
                <div key={f.id} style={{ border: `1px solid ${c.borderSubtle}`, borderRadius: '3px', padding: '4px 6px', background: c.bgPanel }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', minWidth: 0 }}>
                      <span style={{ color: '#f59e0b', fontSize: '9px' }}>★</span>
                      <span style={{ color: c.accent, fontSize: '10px', fontWeight: 600 }}>{f.name}</span>
                      <span style={{ color: c.textFaint, fontSize: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }} title={f.task}>{f.task}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ color: c.textFaint, fontSize: '8px' }}>{new Date(f.favoritedAt).toLocaleString()}</span>
                      <button
                        onClick={() => setFavorites(prev => { const next = prev.filter(x => x.id !== f.id); saveFavorites(next); return next })}
                        style={{ padding: '0 4px', border: 'none', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '9px' }}
                        title="删除收藏"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <pre style={{ margin: 0, color: c.text, fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '60px', overflowY: 'auto' }}>{f.content}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
