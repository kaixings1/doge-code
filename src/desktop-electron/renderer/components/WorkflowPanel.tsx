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
import type { WorkflowDefinition, WorkflowStep, WorkflowRunResult } from '../hooks/useWorkflowAutomation'

interface WorkflowPanelProps {
  /** 所有工作流 */
  workflows: WorkflowDefinition[]
  /** 执行历史 */
  history: WorkflowRunResult[]
  /** 当前执行状态 */
  currentRun: WorkflowRunResult | null
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
  /** 删除工作流回调 */
  onDelete: (id: string) => void
  /** 跳转到文件回调 */
  onGoToFile?: (filePath: string) => void
}

type TabType = 'workflows' | 'editor' | 'history' | 'templates'

const STEP_TYPE_CONFIG: Record<WorkflowStep['type'], { icon: string; color: string; label: string }> = {
  prompt: { icon: '💬', color: '#4FC3F7', label: 'AI 对话' },
  tool: { icon: '🔧', color: '#81C784', label: '工具调用' },
  condition: { icon: '🔀', color: '#FFB74D', label: '条件分支' },
  loop: { icon: '🔁', color: '#CE93D8', label: '循环' },
}

const STEP_STATUS_CONFIG: Record<WorkflowRunResult['stepResults'][0]['status'], { icon: string; color: string; label: string }> = {
  pending: { icon: '⏳', color: '#B0BEC5', label: '等待中' },
  running: { icon: '⏱️', color: '#FFB74D', label: '执行中' },
  completed: { icon: '✅', color: '#81C784', label: '已完成' },
  failed: { icon: '❌', color: '#FF6B6B', label: '失败' },
  skipped: { icon: '⏭️', color: '#B0BEC5', label: '已跳过' },
}

export function WorkflowPanel({
  workflows,
  history,
  currentRun,
  filePath,
  theme,
  onClose,
  onCreateWorkflow,
  onCreateFromTemplate,
  onExecute,
  onCancel,
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
  const [newIcon, setNewIcon] = useState('⚡')

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

  const tabsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '2px',
    borderBottom: `1px solid ${c.border}`,
    background: c.bgAlt,
  }

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px',
    border: 'none',
    background: active ? c.bgPanel : 'transparent',
    color: active ? c.text : c.textMuted,
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
    background: c.inputBg,
    color: c.text,
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const stepNodeStyle = (step: WorkflowStep, isRunning?: boolean, runStatus?: WorkflowRunResult['stepResults'][0]['status']): React.CSSProperties => {
    const typeConfig = STEP_TYPE_CONFIG[step.type]
    const statusConfig = runStatus ? STEP_STATUS_CONFIG[runStatus] : null
    return {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 10px',
      border: `1px solid ${isRunning ? c.accent : c.border}`,
      borderRadius: '4px',
      marginBottom: '4px',
      background: isRunning ? c.accentDim : c.bgAlt,
    }
  }

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
          <button
            onClick={() => {
              if (!newName.trim()) return
              onCreateWorkflow({
                name: newName.trim(),
                description: newDesc.trim() || undefined,
                icon: newIcon || '⚡',
                steps: [],
                trigger: 'manual',
                isTemplate: false,
              })
              setNewName('')
              setNewDesc('')
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
                  <span>{wf.icon || '⚡'}</span>
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
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(wf.id)}
                    style={{ ...buttonStyle, padding: '3px 8px', fontSize: '10px', color: '#FF6B6B' }}
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              {wf.description && <div style={{ color: c.textMuted, fontSize: '11px', marginBottom: '4px' }}>{wf.description}</div>}
              <div style={{ display: 'flex', gap: '6px', fontSize: '10px' }}>
                <span style={badgeStyle(c.textMuted)}>{wf.steps.length} 步</span>
                <span style={badgeStyle(c.accent)}>手动</span>
                {wf.lastRunAt && <span style={badgeStyle(c.textFaint)}>{new Date(wf.lastRunAt).toLocaleString('zh-CN')}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  // 渲染模板列表
  const renderTemplates = () => {
    const builtinTemplates = workflows.filter(w => w.isTemplate)

    return (
      <div>
        <div style={{ marginBottom: '12px', color: c.textMuted, fontSize: '11px' }}>
          从模板创建工作流，可在此基础上自定义修改。
        </div>
        {builtinTemplates.map(template => (
          <div key={template.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '20px' }}>{template.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{template.name}</div>
                <div style={{ color: c.textMuted, fontSize: '11px' }}>{template.description}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button
                onClick={() => onCreateFromTemplate(template)}
                style={{ ...primaryButtonStyle, padding: '4px 12px', fontSize: '11px' }}
              >
                使用模板
              </button>
              <span style={badgeStyle(c.textMuted)}>{template.steps.length} 步</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 渲染编辑器
  const renderEditor = () => {
    if (!editingWorkflow) {
      return (
        <div style={{ textAlign: 'center', padding: '20px', color: c.textMuted, fontSize: '12px' }}>
          选择一个工作流进行编辑，或创建新工作流。
        </div>
      )
    }

    return (
      <div>
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={editingWorkflow.name}
            onChange={e => setEditingWorkflow({ ...editingWorkflow, name: e.target.value })}
            style={{ flex: 1, padding: '6px 8px', ...inputStyle }}
            placeholder="工作流名称"
          />
          <button onClick={() => setEditingWorkflow(null)} style={{ ...buttonStyle, padding: '6px 12px' }}>
            完成
          </button>
        </div>

        {/* 步骤列表 */}
        <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '12px', color: c.textMuted }}>
          步骤 ({editingWorkflow.steps.length})
        </div>
        {editingWorkflow.steps.map((step, index) => {
          const typeConfig = STEP_TYPE_CONFIG[step.type]
          return (
            <div key={step.id} style={{ ...stepNodeStyle(step), opacity: 1 }}>
              <span style={{ fontSize: '16px' }}>{typeConfig.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '12px' }}>{step.name}</div>
                <div style={{ color: c.textMuted, fontSize: '10px' }}>
                  {typeConfig.label} — {step.description || '无描述'}
                </div>
              </div>
              <span style={badgeStyle(typeConfig.color)}>Step {index + 1}</span>
            </div>
          )
        })}

        {/* 添加步骤 */}
        <button style={{ ...buttonStyle, width: '100%', padding: '6px', marginTop: '8px' }}>
          + 添加步骤
        </button>
      </div>
    )
  }

  // 渲染执行历史
  const renderHistory = () => {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontWeight: 600, fontSize: '12px', color: c.textMuted }}>
            执行历史 ({history.length})
          </span>
          {history.length > 0 && (
            <button onClick={onCancel} style={{ ...buttonStyle, padding: '3px 8px', fontSize: '10px' }}>
              清除历史
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div style={{ color: c.textMuted, fontSize: '11px', fontStyle: 'italic', padding: '8px' }}>
            暂无执行记录。
          </div>
        ) : (
          history.map(run => {
            const wf = workflows.find(w => w.id === run.workflowId)
            const duration = run.finishedAt ? run.finishedAt - run.startedAt : 0
            const statusColor = run.status === 'completed' ? '#81C784' : run.status === 'failed' ? '#FF6B6B' : '#FFB74D'

            return (
              <div key={`${run.workflowId}-${run.startedAt}`} style={{ ...cardStyle, opacity: run.status === 'running' ? 0.7 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{wf?.icon || '⚡'}</span>
                    <span style={{ fontWeight: 600, fontSize: '12px' }}>{wf?.name || '未知工作流'}</span>
                  </div>
                  <span style={{ color: statusColor, fontSize: '10px', fontWeight: 600 }}>
                    {run.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: c.textMuted }}>
                  <span>{new Date(run.startedAt).toLocaleString('zh-CN')}</span>
                  <span>{(duration / 1000).toFixed(1)}s</span>
                  <span>
                    {run.stepResults.filter(s => s.status === 'completed').length}/{run.stepResults.length} 步完成
                  </span>
                </div>
                {run.error && <div style={{ color: '#FF6B6B', fontSize: '10px', marginTop: '4px' }}>{run.error}</div>}
              </div>
            )
          })
        )}
      </div>
    )
  }

  // 当前执行状态
  const renderCurrentRun = () => {
    if (!currentRun) return null
    const wf = workflows.find(w => w.id === currentRun.workflowId)

    return (
      <div style={{ position: 'absolute', bottom: '0', left: '0', right: '0', background: c.bgAlt, borderTop: `2px solid ${c.accent}`, padding: '10px 14px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '12px' }}>⏱️ 执行中: {wf?.name || '未知'}</span>
            <span style={badgeStyle('#FFB74D')}>
              {currentRun.stepResults.filter(s => s.status === 'completed').length}/{currentRun.stepResults.length}
            </span>
          </div>
          <button onClick={onCancel} style={{ ...buttonStyle, padding: '3px 10px', fontSize: '10px', color: '#FF6B6B' }}>
            取消
          </button>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {currentRun.stepResults.map((stepResult, idx) => {
            const wfStep = wf?.steps[idx]
            const typeConfig = wfStep ? STEP_TYPE_CONFIG[wfStep.type] : null
            const statusConfig = STEP_STATUS_CONFIG[stepResult.status]

            return (
              <div
                key={stepResult.stepId}
                style={{
                  padding: '4px 8px',
                  borderRadius: '3px',
                  background: statusConfig?.color + '22',
                  color: statusConfig?.color,
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>{typeConfig?.icon || '•'}</span>
                <span>{wfStep?.name || `Step ${idx + 1}`}</span>
                <span>{statusConfig?.icon}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const tabs = [
    { type: 'workflows' as TabType, label: '工作流' },
    { type: 'templates' as TabType, label: '模板' },
    { type: 'editor' as TabType, label: '编辑器' },
    { type: 'history' as TabType, label: '历史' },
  ]

  return (
    <div style={containerStyle}>
      {/* 头部 */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>⚡ AI 工作流</span>
          {filePath && <span style={{ color: c.textMuted, fontSize: '11px' }}>{filePath.split(/[/\\]/).pop()}</span>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.textFaint, cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
      </div>

      {/* 标签页 */}
      <div style={tabsStyle}>
        {tabs.map(tab => (
          <button key={tab.type} onClick={() => setActiveTab(tab.type)} style={tabButtonStyle(activeTab === tab.type)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div style={{ ...bodyStyle, paddingBottom: currentRun ? '80px' : '12px' }}>
        {activeTab === 'workflows' && renderWorkflows()}
        {activeTab === 'templates' && renderTemplates()}
        {activeTab === 'editor' && renderEditor()}
        {activeTab === 'history' && renderHistory()}
      </div>

      {/* 当前执行状态栏 */}
      {renderCurrentRun()}
    </div>
  )
}
