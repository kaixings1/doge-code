/**
 * WorkflowPanel — 工作流自动化面板组件
 *
 * 提供 AI 工作流的可视化编排和执行：
 * - 内置模板（代码审查/重构/测试生成/文档生成）
 * - 自定义工作流创建
 * - 节点编辑（添加/删除/排序步骤）
 * - 工作流执行（模拟执行，显示步骤进度）
 * - 执行历史记录
 */

import React, { useState, useCallback, useMemo } from 'react'
import type { ThemeColors } from '../theme.js'
import type { WorkflowDefinition, WorkflowStep, WorkflowRunResult } from '../hooks/workflowAutomation.types'
import type { BatchJob } from '../hooks/workflowAutomation.types'
import { BatchProcessor } from './BatchProcessor.js'

interface WorkflowPanelProps {
  /** 所有工作流 */
  workflows: WorkflowDefinition[]
  /** 执行历史 */
  history: WorkflowRunResult[]
  /** 当前执行状态 */
  currentRun: WorkflowRunResult | null
  /** 批量任务 */
  batchJobs: BatchJob[]
  /** 批量任务历史 */
  batchHistory: BatchJob[]
  /** 当前文件路径 */
  filePath?: string
  /** 主题颜色 */
  theme: ThemeColors
  /** 关闭回调 */
  onClose: () => void
  /** 创建工作流回调 */
  onCreateWorkflow: (workflow: Omit<WorkflowDefinition, 'id' | 'createdAt'>) => WorkflowDefinition
  /** 从模板创建回调 */
  onCreateFromTemplate: (template: WorkflowDefinition) => WorkflowDefinition
  /** 执行工作流回调 */
  onExecute: (workflowId: string, context: Record<string, unknown>) => Promise<WorkflowRunResult>
  /** 取消执行回调 */
  onCancel: () => void
  /** 执行批量任务回调 */
  onExecuteBatch: (workflowId: string, files: Array<{ filePath: string; fileName?: string }>) => Promise<BatchJob>
  /** 取消批量任务回调 */
  onCancelBatch: (batchId: string) => void
  /** 删除工作流回调 */
  onDelete: (id: string) => void
  /** 跳转到文件回调 */
  onGoToFile?: (filePath: string) => void
}

type TabType = 'workflows' | 'editor' | 'batch' | 'history' | 'templates'

const STEP_TYPE_CONFIG: Record<WorkflowStep['type'], { icon: string; color: string; label: string }> = {
  prompt: { icon: '💬', color: '#4FC3F7', label: 'AI 对话' },
  tool: { icon: '🔧', color: '#81C784', label: '工具调用' },
  condition: { icon: '🔀', color: '#FFB74D', label: '条件分支' },
  loop: { icon: '🔁', color: '#CE93D8', label: '循环' },
}

const STEP_STATUS_CONFIG: Record<WorkflowRunResult['stepResults'][0]['status'], { icon: string; color: string; label: string }> = {
  pending: { icon: '', color: '#B0BEC5', label: '等待中' },
  running: { icon: '⏱', color: '#FFB74D', label: '执行中' },
  completed: { icon: '', color: '#81C784', label: '已完成' },
  failed: { icon: '', color: '#FF6B6B', label: '失败' },
  skipped: { icon: '⏭', color: '#B0BEC5', label: '已跳过' },
}

export function WorkflowPanel({
  workflows,
  history,
  currentRun,
  batchJobs,
  batchHistory,
  filePath,
  theme,
  onClose,
  onCreateWorkflow,
  onCreateFromTemplate,
  onExecute,
  onCancel,
  onExecuteBatch,
  onCancelBatch,
  onDelete,
  onGoToFile,
}: WorkflowPanelProps): JSX.Element {
  const c = theme
  const [activeTab, setActiveTab] = useState<TabType>('workflows')
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDefinition | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowDefinition | null>(null)

  // 新建工作流表单
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [newTrigger, setNewTrigger] = useState<'manual' | 'file-save' | 'timer'>('manual')
  const [triggerFilePattern, setTriggerFilePattern] = useState('*')
  const [triggerInterval, setTriggerInterval] = useState(60)

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '680px',
    maxHeight: '75vh',
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

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0',
    borderBottom: `1px solid ${c.border}`,
    background: c.bgAlt,
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    color: active ? c.accent : c.textMuted,
    background: 'none',
    border: 'none',
    borderBottom: active ? `2px solid ${c.accent}` : '2px solid transparent',
  })

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  }

  const buttonStyle: React.CSSProperties = {
    padding: '5px 12px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgAlt,
    color: c.text,
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: c.accent,
    color: '#000',
    border: 'none',
    fontWeight: 600,
  }

  const cardStyle: React.CSSProperties = {
    padding: '8px 10px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    marginBottom: '6px',
    background: c.bgAlt,
    cursor: 'pointer',
  }

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 7px',
    borderRadius: '10px',
    background: color + '22',
    color,
    fontSize: '10px',
    fontWeight: 500,
  })

  const inputStyle: React.CSSProperties = {
    padding: '5px 8px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgPanel,
    color: c.text,
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  // 步骤操作
  const addStep = useCallback((type: WorkflowStep['type']) => {
    if (!editingWorkflow) return
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      name: type === 'prompt' ? '新 AI 对话步骤' : type === 'tool' ? '新工具调用' : type === 'condition' ? '新条件分支' : '新循环',
      description: '',
      type,
      params: {},
      nextStepId: undefined,
    }
    const steps = [...editingWorkflow.steps, newStep]
    setEditingWorkflow({ ...editingWorkflow, steps })
  }, [editingWorkflow])

  const removeStep = useCallback((stepId: string) => {
    if (!editingWorkflow) return
    setEditingWorkflow({
      ...editingWorkflow,
      steps: editingWorkflow.steps.filter(s => s.id !== stepId),
    })
  }, [editingWorkflow])

  const updateStep = useCallback((stepId: string, updates: Partial<WorkflowStep>) => {
    if (!editingWorkflow) return
    setEditingWorkflow({
      ...editingWorkflow,
      steps: editingWorkflow.steps.map(s => s.id === stepId ? { ...s, ...updates } : s),
    })
  }, [editingWorkflow])

  // 渲染工作流列表
  const renderWorkflows = () => {
    const customWorkflows = workflows.filter(w => !w.isTemplate)

    return (
      <div>
        {/* 新建工作流 */}
        <div style={{ ...cardStyle, marginBottom: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>创建自定义工作流</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
            <input
              value={newIcon}
              onChange={e => setNewIcon(e.target.value)}
              style={{ width: '40px', textAlign: 'center', ...inputStyle }}
              placeholder="🎯"
              maxLength={2}
            />
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="工作流名称"
              style={{ flex: 1, ...inputStyle }}
            />
          </div>
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="描述（可选）"
            style={{ marginBottom: '8px', ...inputStyle }}
          />
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '4px' }}>触发器类型</div>
            <select
              value={newTrigger}
              onChange={e => setNewTrigger(e.target.value as 'manual' | 'file-save' | 'timer')}
              style={{ ...inputStyle, width: '100%' }}
            >
              <option value="manual">手动触发</option>
              <option value="file-save">文件保存时触发</option>
              <option value="timer">定时触发</option>
            </select>
          </div>
          {newTrigger === 'file-save' && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '4px' }}>文件匹配模式</div>
              <input
                value={triggerFilePattern}
                onChange={e => setTriggerFilePattern(e.target.value)}
                placeholder="*（所有文件）或 *.ts/*.py"
                style={{ ...inputStyle, width: '100%' }}
              />
              <div style={{ fontSize: '10px', color: c.textFaint, marginTop: '2px' }}>
                支持通配符：* 匹配任意字符，? 匹配单个字符
              </div>
            </div>
          )}
          {newTrigger === 'timer' && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '4px' }}>执行间隔（秒）</div>
              <input
                type="number"
                value={triggerInterval}
                onChange={e => setTriggerInterval(Number(e.target.value))}
                min={5}
                max={86400}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          )}
          <button
            onClick={() => {
              if (!newName.trim()) return
              const triggerConfig: Record<string, unknown> = {}
              if (newTrigger === 'file-save') {
                triggerConfig.filePattern = triggerFilePattern || '*'
              } else if (newTrigger === 'timer') {
                triggerConfig.interval = triggerInterval || 60
              }
              const workflowData: Omit<WorkflowDefinition, 'id' | 'createdAt'> = {
                name: newName.trim(),
                description: newDesc.trim() || '',
                icon: newIcon || '',
                steps: [],
                trigger: newTrigger,
                isTemplate: false,
              }
              if (Object.keys(triggerConfig).length > 0) {
                workflowData.triggerConfig = triggerConfig
              }
              onCreateWorkflow(workflowData)
              setNewName('')
              setNewDesc('')
              setNewTrigger('manual')
              setTriggerFilePattern('*')
              setTriggerInterval(60)
            }}
            disabled={!newName.trim()}
            style={{ ...primaryButtonStyle, opacity: newName.trim() ? 1 : 0.5 }}
          >
            创建工作流
          </button>
        </div>

        {/* 自定义工作流列表 */}
        <div style={{ marginBottom: '8px', fontWeight: 600, fontSize: '12px', color: c.textMuted }}>
          自定义工作流 ({customWorkflows.length})
        </div>
        {customWorkflows.length === 0 ? (
          <div style={{ color: c.textMuted, fontSize: '11px', fontStyle: 'italic', padding: '8px' }}>
            暂无自定义工作流。可以从模板创建或新建空白工作流。
          </div>
        ) : (
          customWorkflows.map(wf => (
            <div key={wf.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{wf.icon || ''}</span>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>{wf.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => onExecute(wf.id, { filePath: filePath || '' })}
                    disabled={!!currentRun}
                    style={{ ...primaryButtonStyle, padding: '3px 10px', fontSize: '11px', opacity: currentRun ? 0.5 : 1 }}
                  >
                    {currentRun && currentRun.workflowId === wf.id ? '执行中...' : '执行'}
                  </button>
                  <button
                    onClick={() => setEditingWorkflow(wf)}
                    style={{ ...buttonStyle, padding: '3px 8px', fontSize: '10px' }}
                    title="编辑"
                  >
                    ✏
                  </button>
                  <button
                    onClick={() => onDelete(wf.id)}
                    style={{ ...buttonStyle, padding: '3px 8px', fontSize: '10px', color: '#ef5350' }}
                    title="删除"
                  >
                    🗑
                  </button>
                </div>
              </div>
              {wf.description && (
                <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '4px' }}>{wf.description}</div>
              )}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={badgeStyle(wf.trigger === 'manual' ? '#B0BEC5' : wf.trigger === 'file-save' ? '#4FC3F7' : '#FFB74D')}>
                  {wf.trigger === 'manual' ? '手动' : wf.trigger === 'file-save' ? '文件保存' : '定时'}
                </span>
                <span style={{ fontSize: '10px', color: c.textFaint }}>
                  {wf.steps.length} 个步骤
                </span>
                {wf.triggerConfig && wf.trigger === 'file-save' && (
                  <span style={{ fontSize: '10px', color: c.textFaint }}>
                    匹配: {(wf.triggerConfig as { filePattern?: string }).filePattern || '*'}
                  </span>
                )}
                {wf.triggerConfig && wf.trigger === 'timer' && (
                  <span style={{ fontSize: '10px', color: c.textFaint }}>
                    间隔: {(wf.triggerConfig as { interval?: number }).interval || 60}s
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  // 渲染编辑器
  const renderEditor = () => {
    if (!editingWorkflow) {
      return (
        <div style={{ color: c.textMuted, fontSize: '12px', textAlign: 'center', padding: '20px' }}>
          选择一个工作流进行编辑
        </div>
      )
    }

    return (
      <div>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>编辑工作流: {editingWorkflow.icon} {editingWorkflow.name}</div>
          <div style={{ marginBottom: '6px' }}>
            <input
              value={editingWorkflow.name}
              onChange={e => setEditingWorkflow({ ...editingWorkflow, name: e.target.value })}
              placeholder="工作流名称"
              style={{ ...inputStyle }}
            />
          </div>
          <div style={{ marginBottom: '6px' }}>
            <input
              value={editingWorkflow.description || ''}
              onChange={e => setEditingWorkflow({ ...editingWorkflow, description: e.target.value })}
              placeholder="描述"
              style={{ ...inputStyle }}
            />
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '4px' }}>触发器类型</div>
            <select
              value={editingWorkflow.trigger}
              onChange={e => setEditingWorkflow({ ...editingWorkflow, trigger: e.target.value as 'manual' | 'file-save' | 'timer' })}
              style={{ ...inputStyle, width: '100%' }}
            >
              <option value="manual">手动触发</option>
              <option value="file-save">文件保存时触发</option>
              <option value="timer">定时触发</option>
            </select>
          </div>
        </div>

        {/* 步骤列表 */}
        <div style={{ marginBottom: '8px', fontWeight: 600, fontSize: '12px' }}>
          步骤 ({editingWorkflow.steps.length})
        </div>
        {editingWorkflow.steps.length === 0 ? (
          <div style={{ color: c.textMuted, fontSize: '11px', fontStyle: 'italic', padding: '8px' }}>
            暂无步骤。使用下方按钮添加。
          </div>
        ) : (
          editingWorkflow.steps.map((step, idx) => {
            const typeConfig = STEP_TYPE_CONFIG[step.type]
            return (
              <div key={step.id} style={{ ...cardStyle, marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span>{typeConfig.icon}</span>
                  <input
                    value={step.name}
                    onChange={e => updateStep(step.id, { name: e.target.value })}
                    style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                  />
                  <button
                    onClick={() => removeStep(step.id)}
                    style={{ ...buttonStyle, padding: '2px 6px', fontSize: '10px', color: '#ef5350' }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  <select
                    value={step.type}
                    onChange={e => updateStep(step.id, { type: e.target.value as WorkflowStep['type'] })}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    <option value="prompt">AI 对话</option>
                    <option value="tool">工具调用</option>
                    <option value="condition">条件分支</option>
                    <option value="loop">循环</option>
                  </select>
                </div>
                <textarea
                  value={step.description || ''}
                  onChange={e => updateStep(step.id, { description: e.target.value })}
                  placeholder="步骤描述"
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '40px' }}
                />
              </div>
            )
          })
        )}

        {/* 添加步骤按钮 */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          <button onClick={() => addStep('prompt')} style={{ ...buttonStyle, flex: 1 }}>💬 添加 AI 对话</button>
          <button onClick={() => addStep('tool')} style={{ ...buttonStyle, flex: 1 }}>🔧 添加工具调用</button>
          <button onClick={() => addStep('condition')} style={{ ...buttonStyle, flex: 1 }}>🔀 添加条件</button>
          <button onClick={() => addStep('loop')} style={{ ...buttonStyle, flex: 1 }}>🔁 添加循环</button>
        </div>

        {/* 保存/取消 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              if (!editingWorkflow.name.trim()) return
              onCreateWorkflow({
                name: editingWorkflow.name,
                description: editingWorkflow.description || undefined,
                icon: editingWorkflow.icon || '',
                steps: editingWorkflow.steps,
                trigger: editingWorkflow.trigger,
                isTemplate: false,
              })
              setEditingWorkflow(null)
            }}
            disabled={!editingWorkflow.name.trim()}
            style={{ ...primaryButtonStyle, flex: 1 }}
          >
            保存工作流
          </button>
          <button onClick={() => setEditingWorkflow(null)} style={{ ...buttonStyle, flex: 1 }}>
            取消
          </button>
        </div>
      </div>
    )
  }

  // 渲染批量处理
  const renderBatch = () => {
    return (
      <BatchProcessor
        workflows={workflows}
        batchJobs={batchJobs}
        batchHistory={batchHistory}
        onExecute={onExecuteBatch}
        onCancel={onCancelBatch}
        theme={theme}
        defaultFilePath={filePath}
      />
    )
  }

  // 渲染历史
  const renderHistory = () => {
    if (history.length === 0) {
      return (
        <div style={{ color: c.textMuted, fontSize: '12px', textAlign: 'center', padding: '20px' }}>
          暂无执行历史
        </div>
      )
    }

    return (
      <div>
        {history.slice(0, 20).map(run => {
          const wf = workflows.find(w => w.id === run.workflowId)
          const statusConfig = STEP_STATUS_CONFIG[run.stepResults[0]?.status || 'pending']
          return (
            <div key={run.workflowId + run.startedAt} style={{ ...cardStyle, marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span>{wf?.icon || ''}</span>
                <span style={{ fontWeight: 600, fontSize: '12px' }}>{wf?.name || '未知工作流'}</span>
                <span style={{ ...badgeStyle(statusConfig.color), marginLeft: 'auto' }}>
                  {statusConfig.icon} {run.status}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: c.textFaint }}>
                {new Date(run.startedAt).toLocaleString()}
                {run.finishedAt && ` (耗时 ${((run.finishedAt - run.startedAt) / 1000).toFixed(1)}s)`}
              </div>
              {run.error && (
                <div style={{ fontSize: '11px', color: '#ef5350', marginTop: '4px' }}>{run.error}</div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // 渲染模板
  const renderTemplates = () => {
    const templates = workflows.filter(w => w.isTemplate)

    return (
      <div>
        <div style={{ marginBottom: '8px', fontSize: '11px', color: c.textMuted }}>
          从模板创建工作流，自动填充步骤配置
        </div>
        {templates.map(template => (
          <div key={template.id} style={{ ...cardStyle, marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span>{template.icon || '📋'}</span>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{template.name}</span>
            </div>
            {template.description && (
              <div style={{ fontSize: '11px', color: c.textMuted, marginBottom: '4px' }}>{template.description}</div>
            )}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
              <span style={badgeStyle('#4FC3F7')}>{template.steps.length} 步骤</span>
              {template.steps.map((step, idx) => (
                <span key={step.id} style={{ fontSize: '10px', color: c.textFaint }}>
                  {idx + 1}. {STEP_TYPE_CONFIG[step.type].icon} {step.name}
                </span>
              ))}
            </div>
            <button
              onClick={() => onCreateFromTemplate(template)}
              style={{ ...primaryButtonStyle, width: '100%' }}
            >
              使用此模板
            </button>
          </div>
        ))}
      </div>
    )
  }

  const stepTypeConfig = STEP_TYPE_CONFIG

  return (
    <div style={containerStyle}>
      {/* 头部 */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}> 工作流自动化</span>
          <span style={{ color: c.textMuted, fontSize: '11px' }}>可视化编排 AI 任务</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.textFaint, cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
      </div>

      {/* 标签栏 */}
      <div style={tabBarStyle}>
        <button style={tabStyle(activeTab === 'workflows')} onClick={() => setActiveTab('workflows')}>工作流</button>
        <button style={tabStyle(activeTab === 'editor')} onClick={() => setActiveTab('editor')}>编辑器</button>
        <button style={tabStyle(activeTab === 'batch')} onClick={() => setActiveTab('batch')}>
          批量 {batchJobs.length > 0 ? `(${batchJobs.length})` : ''}
        </button>
        <button style={tabStyle(activeTab === 'templates')} onClick={() => setActiveTab('templates')}>模板</button>
        <button style={tabStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>
          历史 {history.length > 0 && `(${history.length})`}
        </button>
      </div>

      {/* 内容区 */}
      <div style={bodyStyle}>
        {activeTab === 'workflows' && renderWorkflows()}
        {activeTab === 'editor' && renderEditor()}
        {activeTab === 'batch' && renderBatch()}
        {activeTab === 'templates' && renderTemplates()}
        {activeTab === 'history' && renderHistory()}
      </div>

      {/* 执行状态栏 */}
      {currentRun && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${c.border}`, background: c.bgAlt, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px' }}>
            ⏱ 执行中: {workflows.find(w => w.id === currentRun.workflowId)?.name || '未知'}
          </span>
          <span style={{ fontSize: '11px', color: c.textMuted }}>
            步骤 {currentRun.stepResults.filter(s => s.status === 'completed').length}/{currentRun.stepResults.length}
          </span>
          <button onClick={onCancel} style={{ ...buttonStyle, marginLeft: 'auto', padding: '3px 10px', fontSize: '11px', color: '#ef5350' }}>
            取消
          </button>
        </div>
      )}
    </div>
  )
}
