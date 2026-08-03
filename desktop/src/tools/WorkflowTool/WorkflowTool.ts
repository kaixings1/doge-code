import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { join, basename, extname } from 'path'

const inputSchema = lazySchema(() =>
  z.object({
    script: z.string().describe('工作流脚本名称或内容'),
    args: z.record(z.string()).optional().describe('脚本参数'),
    mode: z.enum(['run', 'list', 'create', 'delete', 'show']).optional().describe('工作流操作模式'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('工作流是否执行成功'),
    output: z.string().optional().describe('工作流输出'),
    error: z.string().optional().describe('错误消息'),
    workflows: z.array(z.string()).optional().describe('工作流列表'),
    steps: z.array(z.string()).optional().describe('工作流步骤'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

const WORKFLOW_DIR = join(process.env.TEMP || '.', 'doge-workflows')

interface WorkflowDefinition {
  name: string
  description: string
  steps: string[]
  createdAt: string
  updatedAt: string
}

async function ensureWorkflowDir(): Promise<void> {
  try {
    await mkdir(WORKFLOW_DIR, { recursive: true })
  } catch {
    // directory may already exist
  }
}

async function loadWorkflow(name: string): Promise<WorkflowDefinition | null> {
  try {
    await ensureWorkflowDir()
    const content = await readFile(join(WORKFLOW_DIR, `${name}.workflow.json`), { encoding: 'utf8' })
    return JSON.parse(content) as WorkflowDefinition
  } catch {
    return null
  }
}

async function saveWorkflow(workflow: WorkflowDefinition): Promise<void> {
  await ensureWorkflowDir()
  await writeFile(
    join(WORKFLOW_DIR, `${workflow.name}.workflow.json`),
    JSON.stringify(workflow, null, 2),
    { encoding: 'utf8' },
  )
}

async function listWorkflows(): Promise<string[]> {
  try {
    await ensureWorkflowDir()
    const files = await readdir(WORKFLOW_DIR)
    return files.filter(f => f.endsWith('.workflow.json')).map(f => basename(f, '.workflow.json'))
  } catch {
    return []
  }
}

function parseWorkflowScript(script: string): string[] {
  const steps: string[] = []
  const lines = script.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (trimmed.startsWith('->') || trimmed.startsWith('step ')) {
      steps.push(trimmed.replace(/^(->|step\s+)/i, '').trim())
    } else if (trimmed.startsWith('run ') || trimmed.startsWith('execute ')) {
      steps.push(trimmed.replace(/^(run|execute)\s+/i, '').trim())
    } else if (trimmed.match(/^[\w./-]+/)) {
      const match = trimmed.match(/^([\w./-]+(?:\s+[\w./-]+)*)/)
      if (match) steps.push(match[1])
    }
  }
  if (steps.length === 0 && script.trim()) {
    steps.push(script.trim())
  }
  return steps
}

async function executeWorkflowStep(step: string, args: Record<string, string>): Promise<string> {
  const interpolated = step.replace(/\$\{(\w+)\}/g, (_, key) => args[key] ?? `$${key}`)
  return `[执行] ${interpolated}`
}

export const WorkflowTool = buildTool({
  name: 'workflow',
  description: async () => '执行工作流脚本（支持 run/list/create/delete/show）',
  callOn: 'manual',
  async prompt() {
    return '使用 workflow 工具管理工作流。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'workflow'
  },
  isEnabled() {
    return true
  },
  toAutoClassifierInput() {
    return ''
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage(input) {
    const mode = (input as Record<string, unknown>)?.mode || (input as Record<string, unknown>)?.script?.slice(0, 20) ?? '?'
    return `Workflow: ${mode}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: (content as Record<string, unknown>).output || (content as Record<string, unknown>).message || 'Workflow operation completed',
    }
  },
  async call({ script, args = {}, mode = 'run' }) {
    switch (mode) {
      case 'list': {
        const workflows = await listWorkflows()
        return {
          data: {
            success: true,
            workflows,
            output: workflows.length > 0 ? `找到 ${workflows.length} 个工作流: ${workflows.join(', ')}` : '暂无工作流',
          } as Output,
        }
      }
      case 'show': {
        const workflow = await loadWorkflow(script)
        if (!workflow) {
          return { data: { success: false, output: '', error: `工作流 "${script}" 不存在` } as Output }
        }
        return {
          data: {
            success: true,
            output: `${workflow.description || workflow.name}\n步骤:\n${workflow.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`,
            steps: workflow.steps,
          } as Output,
        }
      }
      case 'create': {
        const steps = parseWorkflowScript(script)
        if (steps.length === 0) {
          return { data: { success: false, output: '', error: '工作流脚本为空' } as Output }
        }
        const workflowName = args.name || `workflow_${Date.now()}`
        const workflow: WorkflowDefinition = {
          name: workflowName,
          description: args.description || '',
          steps,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await saveWorkflow(workflow)
        return {
          data: {
            success: true,
            output: `工作流 "${workflowName}" 已创建 (${steps.length} 步骤)`,
            steps,
          } as Output,
        }
      }
      case 'delete': {
        const { unlink } = await import('fs/promises')
        try {
          await unlink(join(WORKFLOW_DIR, `${script}.workflow.json`))
          return { data: { success: true, output: `工作流 "${script}" 已删除` } as Output }
        } catch {
          return { data: { success: false, output: '', error: `工作流 "${script}" 不存在` } as Output }
        }
      }
      case 'run': {
        // 检查是否已命名工作流
        let steps: string[] = []
        const namedWorkflow = await loadWorkflow(script)
        if (namedWorkflow) {
          steps = namedWorkflow.steps
        } else {
          steps = parseWorkflowScript(script)
        }

        if (steps.length === 0) {
          return { data: { success: false, output: '', error: '工作流为空或不存在' } as Output }
        }

        const outputs: string[] = []
        let failed = false

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]
          try {
            const result = await executeWorkflowStep(step, args)
            outputs.push(`[${i + 1}/${steps.length}] ${result}`)
          } catch (err) {
            outputs.push(`[${i + 1}/${steps.length}] 失败: ${err instanceof Error ? err.message : String(err)}`)
            failed = true
            break
          }
        }

        const summary = outputs.join('\n')
        return {
          data: {
            success: !failed,
            output: `${failed ? '工作流执行失败' : '工作流执行完成'}\n${summary}`,
            steps,
            error: failed ? '某步骤执行失败' : undefined,
          } as Output,
        }
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
