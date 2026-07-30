/**
 * useWorkflowAutomation — 工作流自动化 Hook
 *
 * 提供工作流的创建、编辑、执行和管理功能：
 * - 内置模板（代码审查、重构、测试生成、文档生成）
 * - 自定义工作流创建
 * - 工作流执行（模拟执行，显示步骤进度）
 * - 执行历史记录
 * - 批量处理（对多个文件执行工作流）
 * - localStorage 持久化
 * - 事件触发器（file-save、timer）
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { WorkflowStep, WorkflowDefinition, WorkflowRunResult, BatchFileItem, BatchJob } from './workflowAutomation.types'

const STORAGE_KEY = 'doge-workflows'
const HISTORY_KEY = 'doge-workflow-history'
const BATCH_HISTORY_KEY = 'doge-batch-history'

// 内置模板
export const BUILTIN_TEMPLATES: WorkflowDefinition[] = [
  {
    id: 'template-code-review',
    name: '代码审查',
    description: '自动分析代码质量、安全漏洞和性能问题',
    icon: '🔍',
    isTemplate: true,
    trigger: 'manual',
    createdAt: Date.now() - 86400000,
    steps: [
      { id: 's1', name: '读取代码', description: '读取当前文件内容', type: 'tool', params: { tool: 'FileRead', args: ['${filePath}'] }, nextStepId: 's2' },
      { id: 's2', name: '分析代码质量', description: 'AI 分析代码质量、潜在问题和改进建议', type: 'prompt', params: { prompt: '请对以下代码进行全面的代码审查，包括：代码质量、潜在bug、性能问题、安全漏洞、代码风格。输出结构化审查报告。\n\n${step_s1_output}' }, nextStepId: 's3' },
      { id: 's3', name: '生成修复建议', description: '根据审查结果生成可执行的修复方案', type: 'prompt', params: { prompt: '基于以下代码审查结果，给出具体的修复建议和代码改进方案。\n\n${step_s2_output}' }, nextStepId: 's4' },
      { id: 's4', name: '应用修复', description: '自动应用修复到代码文件', type: 'tool', params: { tool: 'Edit', args: ['${filePath}', '${fix}'] }, nextStepId: undefined },
    ],
  },
  {
    id: 'template-refactor',
    name: '代码重构',
    description: '识别代码异味并提供重构方案',
    icon: '♻️',
    isTemplate: true,
    trigger: 'manual',
    createdAt: Date.now() - 86400000,
    steps: [
      { id: 's1', name: '读取代码', description: '读取当前文件内容', type: 'tool', params: { tool: 'FileRead', args: ['${filePath}'] }, nextStepId: 's2' },
      { id: 's2', name: '识别代码异味', description: 'AI 识别代码中的坏味道', type: 'prompt', params: { prompt: '分析以下代码中的代码异味（Code Smells），包括：长方法、大类、重复代码、过长参数列表、特性嫉妒等。列出具体问题和行号。\n\n${step_s1_output}' }, nextStepId: 's3' },
      { id: 's3', name: '生成重构方案', description: '为每个代码异味生成重构方案', type: 'prompt', params: { prompt: '针对以下代码异味，生成具体的重构方案和改进后的代码。\n\n${step_s2_output}' }, nextStepId: undefined },
    ],
  },
  {
    id: 'template-test-gen',
    name: '测试生成',
    description: '为代码自动生成单元测试',
    icon: '🧪',
    isTemplate: true,
    trigger: 'manual',
    createdAt: Date.now() - 86400000,
    steps: [
      { id: 's1', name: '读取源代码', description: '读取当前文件内容', type: 'tool', params: { tool: 'FileRead', args: ['${filePath}'] }, nextStepId: 's2' },
      { id: 's2', name: '生成测试用例', description: 'AI 生成全面的单元测试用例', type: 'prompt', params: { prompt: '为以下代码生成全面的单元测试用例。覆盖正常情况、边界条件、错误处理。使用 Jest/Vitest 框架。\n\n${step_s1_output}' }, nextStepId: 's3' },
      { id: 's3', name: '创建测试文件', description: '将测试代码写入文件', type: 'tool', params: { tool: 'Write', args: ['${testFilePath}', '${step_s2_output}'] }, nextStepId: undefined },
    ],
  },
  {
    id: 'template-docs',
    name: '文档生成',
    description: '为代码生成 JSDoc/文档注释',
    icon: '📝',
    isTemplate: true,
    trigger: 'manual',
    createdAt: Date.now() - 86400000,
    steps: [
      { id: 's1', name: '读取代码', description: '读取当前文件内容', type: 'tool', params: { tool: 'FileRead', args: ['${filePath}'] }, nextStepId: 's2' },
      { id: 's2', name: '生成文档注释', description: 'AI 为函数/类生成完整的文档注释', type: 'prompt', params: { prompt: '为以下代码生成 JSDoc 格式的文档注释，包括参数说明、返回值、异常、示例。\n\n${step_s1_output}' }, nextStepId: 's3' },
      { id: 's3', name: '应用文档', description: '将文档注释应用到代码文件', type: 'tool', params: { tool: 'Edit', args: ['${filePath}', '${step_s2_output}'] }, nextStepId: undefined },
    ],
  },
]

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* ignore */ }
  return fallback
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore */ }
}

export interface UseWorkflowAutomationReturn {
  workflows: WorkflowDefinition[]
  history: WorkflowRunResult[]
  currentRun: WorkflowRunResult | null
  batchJobs: BatchJob[]
  batchHistory: BatchJob[]
  createWorkflow: (workflow: Omit<WorkflowDefinition, 'id' | 'createdAt'>) => WorkflowDefinition
  updateWorkflow: (id: string, updates: Partial<WorkflowDefinition>) => void
  deleteWorkflow: (id: string) => void
  createFromTemplate: (template: WorkflowDefinition) => WorkflowDefinition
  executeWorkflow: (workflowId: string, context: Record<string, unknown>) => Promise<WorkflowRunResult>
  cancelRun: () => void
  clearHistory: () => void
  getWorkflow: (id: string) => WorkflowDefinition | undefined
  onFileSave: (filePath: string) => void
  registerFileSaveCallback: (cb: (filePath: string) => void) => void
  executeBatch: (workflowId: string, files: Array<{ filePath: string; fileName?: string }>) => Promise<BatchJob>
  cancelBatch: (batchId: string) => void
}

export function useWorkflowAutomation(filePath?: string): UseWorkflowAutomationReturn {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(() => {
    const stored = loadFromStorage<WorkflowDefinition[]>(STORAGE_KEY, [])
    const templateIds = new Set(stored.filter(w => w.isTemplate).map(w => w.id))
    const builtin = BUILTIN_TEMPLATES.filter(t => !templateIds.has(t.id))
    return [...builtin, ...stored.filter(w => !w.isTemplate)]
  })

  const [history, setHistory] = useState<WorkflowRunResult[]>(() =>
    loadFromStorage<WorkflowRunResult[]>(HISTORY_KEY, [])
  )
  const [currentRun, setCurrentRun] = useState<WorkflowRunResult | null>(null)
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>(() =>
    loadFromStorage<BatchJob[]>(STORAGE_KEY.replace('doge-workflows', 'doge-batch-jobs'), [])
  )
  const [batchHistory, setBatchHistory] = useState<BatchJob[]>(() =>
    loadFromStorage<BatchJob[]>(BATCH_HISTORY_KEY, [])
  )
  const cancelRef = useRef(false)
  const filePathRef = useRef(filePath)
  filePathRef.current = filePath

  // 批量任务取消控制
  const batchCancelRef = useRef<Map<string, boolean>>(new Map())

  // 触发器系统
  const fileSaveCallbackRef = useRef<((filePath: string) => void) | null>(null)
  const lastTriggeredRef = useRef<Map<string, number>>(new Map())
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 持久化
  useEffect(() => {
    saveToStorage(STORAGE_KEY, workflows)
  }, [workflows])

  useEffect(() => {
    saveToStorage(HISTORY_KEY, history)
  }, [history])

  useEffect(() => {
    saveToStorage(STORAGE_KEY.replace('doge-workflows', 'doge-batch-jobs'), batchJobs)
  }, [batchJobs])

  useEffect(() => {
    saveToStorage(BATCH_HISTORY_KEY, batchHistory)
  }, [batchHistory])

  const createWorkflow = useCallback((workflow: Omit<WorkflowDefinition, 'id' | 'createdAt'>): WorkflowDefinition => {
    const newWorkflow: WorkflowDefinition = {
      ...workflow,
      id: `wf-${Date.now()}`,
      createdAt: Date.now(),
    }
    setWorkflows(prev => [...prev, newWorkflow])
    return newWorkflow
  }, [])

  const updateWorkflow = useCallback((id: string, updates: Partial<WorkflowDefinition>) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w))
  }, [])

  const deleteWorkflow = useCallback((id: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== id))
  }, [])

  const createFromTemplate = useCallback((template: WorkflowDefinition): WorkflowDefinition => {
    const newWorkflow: WorkflowDefinition = {
      ...template,
      id: `wf-${Date.now()}`,
      isTemplate: false,
      createdAt: Date.now(),
      steps: template.steps.map(s => ({
        ...s,
        id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      })),
    }
    setWorkflows(prev => [...prev, newWorkflow])
    return newWorkflow
  }, [])

  const executeWorkflow = useCallback(async (workflowId: string, context: Record<string, unknown>): Promise<WorkflowRunResult> => {
    const workflow = workflows.find(w => w.id === workflowId)
    if (!workflow) {
      return {
        workflowId,
        status: 'failed',
        startedAt: Date.now(),
        finishedAt: Date.now(),
        stepResults: [],
        error: '工作流不存在',
      }
    }

    cancelRef.current = false
    const runResult: WorkflowRunResult = {
      workflowId,
      status: 'running',
      startedAt: Date.now(),
      stepResults: workflow.steps.map(s => ({
        stepId: s.id,
        status: 'pending' as const,
        durationMs: 0,
      })),
    }
    setCurrentRun(runResult)

    const stepOutputs = new Map<string, string>()

    for (let i = 0; i < workflow.steps.length; i++) {
      if (cancelRef.current) {
        runResult.status = 'cancelled'
        runResult.finishedAt = Date.now()
        runResult.error = '用户取消'
        setCurrentRun(null)
        setHistory(prev => [runResult, ...prev])
        return runResult
      }

      const step = workflow.steps[i]
      const stepResult = runResult.stepResults[i]
      stepResult.status = 'running'
      setCurrentRun({ ...runResult })

      const startTime = performance.now()
      try {
        let params = { ...step.params }
        for (const [key, value] of Object.entries(params)) {
          if (typeof value === 'string') {
            params[key] = value
              .replace(/\$\{filePath\}/g, (filePathRef.current || (context.filePath as string) || '') as string)
              .replace(/\$\{step_(\w+)_output\}/g, (_, stepId) => stepOutputs.get(stepId) || '')
              .replace(/\$\{(\w+)\}/g, (_, key) => ((context[key] as string) || '') as string)
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000))

        const output = `[${step.name}] 执行完成\n参数: ${JSON.stringify(params, null, 2)}`
        stepOutputs.set(step.id, output)
        stepResult.status = 'completed'
        stepResult.output = output
      } catch (err) {
        stepResult.status = 'failed'
        stepResult.error = err instanceof Error ? err.message : String(err)
      }
      stepResult.durationMs = Math.round(performance.now() - startTime)

      setCurrentRun({ ...runResult })
    }

    runResult.status = 'completed'
    runResult.finishedAt = Date.now()
    runResult.output = stepOutputs.get(workflow.steps[workflow.steps.length - 1]?.id || '') || '工作流执行完成'
    setCurrentRun(null)

    setWorkflows(prev => prev.map(w => w.id === workflowId ? { ...w, lastRunAt: Date.now() } : w))

    setHistory(prev => [runResult, ...prev].slice(0, 50))

    return runResult
  }, [workflows])

  const cancelRun = useCallback(() => {
    cancelRef.current = true
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const getWorkflow = useCallback((id: string) => {
    return workflows.find(w => w.id === id)
  }, [workflows])

  // 触发器：file-save
  const onFileSave = useCallback((savedFilePath: string) => {
    if (fileSaveCallbackRef.current) {
      fileSaveCallbackRef.current(savedFilePath)
    }
    const matching = workflows.filter(w => {
      if (w.trigger !== 'file-save') return false
      const lastTime = lastTriggeredRef.current.get(w.id)
      if (lastTime && Date.now() - lastTime < 5000) return false
      if (w.triggerConfig?.pattern) {
        const pattern = w.triggerConfig.pattern as string
        if (!savedFilePath.includes(pattern) && !pattern.includes('*')) return false
      }
      return true
    })
    matching.forEach(wf => {
      lastTriggeredRef.current.set(wf.id, Date.now())
      executeWorkflow(wf.id, { filePath: savedFilePath })
    })
  }, [workflows, executeWorkflow])

  const registerFileSaveCallback = useCallback((cb: (filePath: string) => void) => {
    fileSaveCallbackRef.current = cb
  }, [])

  // 批量执行工作流
  const executeBatch = useCallback(async (
    workflowId: string,
    files: Array<{ filePath: string; fileName?: string }>
  ): Promise<BatchJob> => {
    const workflow = workflows.find(w => w.id === workflowId)
    if (!workflow) {
      throw new Error('工作流不存在')
    }

    const batchId = `batch-${Date.now()}`
    const batchItems: BatchFileItem[] = files.map(f => ({
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filePath: f.filePath,
      fileName: f.fileName || f.filePath.split(/[/\\]/).pop() || f.filePath,
      status: 'pending' as const,
    }))

    const batchJob: BatchJob = {
      id: batchId,
      name: `批量: ${workflow.name}`,
      workflowId,
      files: batchItems,
      status: 'running',
      startedAt: Date.now(),
      completedCount: 0,
      failedCount: 0,
    }

    setBatchJobs(prev => [batchJob, ...prev])
    batchCancelRef.current.set(batchId, false)

    // 逐个执行工作流
    for (const item of batchItems) {
      if (batchCancelRef.current.get(batchId)) {
        batchJob.status = 'cancelled'
        batchJob.finishedAt = Date.now()
        item.status = 'skipped'
        break
      }

      item.status = 'running'
      setBatchJobs(prev => [...prev])

      try {
        const result = await executeWorkflow(workflowId, { filePath: item.filePath })
        if (result.status === 'completed') {
          item.status = 'completed'
          item.output = result.output
          batchJob.completedCount++
        } else {
          item.status = 'failed'
          item.error = result.error || '执行失败'
          batchJob.failedCount++
        }
      } catch (err) {
        item.status = 'failed'
        item.error = err instanceof Error ? err.message : String(err)
        batchJob.failedCount++
      }

      item.durationMs = item.durationMs || 0
      setBatchJobs(prev => [...prev])
    }

    batchJob.status = batchJob.status === 'cancelled' ? 'cancelled' : 'completed'
    batchJob.finishedAt = Date.now()

    // 移到历史
    setBatchHistory(prev => [batchJob, ...prev].slice(0, 50))
    setBatchJobs(prev => prev.filter(j => j.id !== batchId))
    batchCancelRef.current.delete(batchId)

    return batchJob
  }, [workflows, executeWorkflow])

  const cancelBatch = useCallback((batchId: string) => {
    batchCancelRef.current.set(batchId, true)
    setBatchJobs(prev => prev.map(j => {
      if (j.id === batchId) {
        return { ...j, status: 'cancelled' as const, finishedAt: Date.now() }
      }
      return j
    }))
  }, [])

  // 触发器：timer
  useEffect(() => {
    const timerWorkflows = workflows.filter(w => w.trigger === 'timer')
    if (timerWorkflows.length === 0) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      return
    }
    const intervals = timerWorkflows.map(w => ((w.triggerConfig?.interval as number) || 30000))
    const minInterval = Math.min(...intervals)
    timerIntervalRef.current = setInterval(() => {
      timerWorkflows.forEach(wf => {
        const interval = ((wf.triggerConfig?.interval as number) || 30000)
        const lastTime = lastTriggeredRef.current.get(wf.id) || 0
        if (Date.now() - lastTime >= interval) {
          lastTriggeredRef.current.set(wf.id, Date.now())
          executeWorkflow(wf.id, { filePath: filePathRef.current || '' })
        }
      })
    }, Math.min(minInterval, 30000))
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }
  }, [workflows, executeWorkflow])

  // 清理过期触发器记录
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      for (const [id, time] of lastTriggeredRef.current) {
        if (now - time > 60000) {
          lastTriggeredRef.current.delete(id)
        }
      }
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  return {
    workflows: [...workflows],
    history,
    currentRun,
    batchJobs,
    batchHistory,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    createFromTemplate,
    executeWorkflow,
    cancelRun,
    clearHistory,
    getWorkflow,
    onFileSave,
    registerFileSaveCallback,
    executeBatch,
    cancelBatch,
  }
}
