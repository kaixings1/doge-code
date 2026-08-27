import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

const HELP = `Spec Workflow — 规格驱动开发工作流 (Spec-Driven Development)

用法: /spec-workflow [子命令] [选项]

子命令:
  guide                 加载工作流指南 (Requirements → Design → Tasks → Implementation)
  status <spec-name>    查看规格进度和当前阶段
  approvals <action>    管理审批请求 (request/status/delete)
  log <task-id>         记录任务实现详情
  steering              加载项目引导文档指南

选项:
  --project <path>      项目根目录路径 (默认: 当前目录)
  --json                JSON 格式输出
  --help               显示帮助

示例:
  /spec-workflow guide
  /spec-workflow status user-auth
  /spec-workflow approvals request --title "Requirements" --file .spec-workflow/specs/xxx/requirements.md
  /spec-workflow log task-001 --task "Implement login"
`

interface SpecPhase {
  name: string
  status: 'missing' | 'created' | 'approved' | 'in-progress'
  lastModified?: string
}

interface SpecStatus {
  name: string
  description: string
  currentPhase: string
  overallStatus: string
  phases: SpecPhase[]
  taskProgress: { total: number; completed: number; pending: number }
}

interface ApprovalRequest {
  id: string
  title: string
  type: 'document' | 'action'
  category: 'spec' | 'steering'
  categoryName: string
  status: 'pending' | 'approved' | 'rejected' | 'needs-revision'
  createdAt: string
}

// 内存存储
const memoryStore = {
  specs: new Map<string, { description: string; phases: Record<string, { exists: boolean; approved: boolean; lastModified: string }>; taskProgress: { total: number; completed: number; pending: number } }>(),
  approvals: new Map<string, ApprovalRequest>(),
  implementationLogs: new Map<string, any[]>(),
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function now(): string {
  return new Date().toISOString()
}

// Spec 工作流指南
function getSpecWorkflowGuide(): string {
  return `# Spec Development Workflow

## Overview

通过 MCP 工具引导用户进行规格驱动开发。将粗略想法转化为详细规格：
Requirements → Design → Tasks → Implementation

## Workflow

### Phase 1: Requirements
1. 读取模板: .spec-workflow/templates/requirements-template.md
2. 创建文件: .spec-workflow/specs/{name}/requirements.md
3. 请求审批
4. 根据反馈修订

### Phase 2: Design
1. 读取模板: .spec-workflow/templates/design-template.md
2. 分析代码库模式
3. 创建设计文档
4. 请求审批

### Phase 3: Tasks
1. 读取模板: .spec-workflow/templates/tasks-template.md
2. 创建任务列表
3. 请求审批

### Phase 4: Implementation
1. 读取 tasks.md
2. 实现代码 (标记 [ ] → [-] )
3. 完成后标记 ( [-] → [x] )
4. 记录实现日志

## Naming Convention
- 规格名使用 kebab-case (如: user-authentication)
- 一次只创建一个规格

## Task Markers
- [ ] pending
- [-] in-progress
- [x] completed
`
}

// Steering 工作流指南
function getSteeringGuide(): string {
  return `# Steering Workflow

## Overview

创建项目级引导文档 (仅在用户明确请求时使用)。

## Documents

### product.md
- 产品愿景和目标
- 目标用户
- 核心功能

### tech.md
- 技术栈选择
- 架构决策
- 依赖管理

### structure.md
- 目录结构
- 代码组织
- 命名约定

## Workflow
1. 检查是否存在 steering docs
2. 读取模板
3. 生成文档
4. 请求审批
`
}

// 获取规格状态
function getSpecStatus(specName: string): SpecStatus | null {
  const spec = memoryStore.specs.get(specName)
  if (!spec) return null

  const phases: SpecPhase[] = [
    { name: 'Requirements', status: spec.phases.requirements?.exists ? (spec.phases.requirements.approved ? 'approved' : 'created') : 'missing', lastModified: spec.phases.requirements?.lastModified },
    { name: 'Design', status: spec.phases.design?.exists ? (spec.phases.design.approved ? 'approved' : 'created') : 'missing', lastModified: spec.phases.design?.lastModified },
    { name: 'Tasks', status: spec.phases.tasks?.exists ? (spec.phases.tasks.approved ? 'approved' : 'created') : 'missing', lastModified: spec.phases.tasks?.lastModified },
    { name: 'Implementation', status: spec.phases.implementation?.exists ? 'in-progress' : 'not-started' },
  ]

  let currentPhase = 'not-started'
  let overallStatus = 'not-started'

  if (!spec.phases.requirements?.exists) {
    currentPhase = 'requirements'
    overallStatus = 'requirements-needed'
  } else if (!spec.phases.design?.exists) {
    currentPhase = 'design'
    overallStatus = 'design-needed'
  } else if (!spec.phases.tasks?.exists) {
    currentPhase = 'tasks'
    overallStatus = 'tasks-needed'
  } else if (spec.taskProgress.pending > 0) {
    currentPhase = 'implementation'
    overallStatus = 'implementing'
  } else if (spec.taskProgress.total > 0 && spec.taskProgress.completed === spec.taskProgress.total) {
    currentPhase = 'completed'
    overallStatus = 'completed'
  } else {
    currentPhase = 'implementation'
    overallStatus = 'ready-for-implementation'
  }

  return {
    name: specName,
    description: spec.description,
    currentPhase,
    overallStatus,
    phases,
    taskProgress: spec.taskProgress,
  }
}

// 格式化规格状态
function formatSpecStatus(status: SpecStatus): string {
  let md = `# Spec Status: ${status.name}\n\n`
  md += `**Description**: ${status.description}\n\n`
  md += `**Current Phase**: ${status.currentPhase}\n`
  md += `**Overall Status**: ${status.overallStatus}\n\n`
  md += `## Phases\n\n`
  md += `| Phase | Status | Last Modified |\n`
  md += `|-------|--------|---------------|\n`
  for (const phase of status.phases) {
    md += `| ${phase.name} | ${phase.status} | ${phase.lastModified || 'N/A'} |\n`
  }
  md += `\n## Task Progress\n\n`
  md += `- Total: ${status.taskProgress.total}\n`
  md += `- Completed: ${status.taskProgress.completed}\n`
  md += `- Pending: ${status.taskProgress.pending}\n`
  return md
}

// 格式化审批列表
function formatApprovalsList(): string {
  const approvals = Array.from(memoryStore.approvals.values())
  if (approvals.length === 0) return '# Approvals\n\nNo active approval requests.\n'

  let md = `# Approvals\n\n`
  md += `| ID | Title | Type | Status | Created |\n`
  md += `|-----|-------|------|--------|---------|\n`
  for (const a of approvals) {
    md += `| ${a.id} | ${a.title} | ${a.type} | ${a.status} | ${a.createdAt.slice(0, 10)} |\n`
  }
  return md
}

// 注册规格
function registerSpec(specName: string, description = ''): void {
  if (!memoryStore.specs.has(specName)) {
    memoryStore.specs.set(specName, {
      description,
      phases: {
        requirements: { exists: false, approved: false, lastModified: '' },
        design: { exists: false, approved: false, lastModified: '' },
        tasks: { exists: false, approved: false, lastModified: '' },
        implementation: { exists: false },
      },
      taskProgress: { total: 0, completed: 0, pending: 0 },
    })
  }
}

// 导出测试用重置函数
export function resetSpecWorkflowStore(): void {
  memoryStore.specs.clear()
  memoryStore.approvals.clear()
  memoryStore.implementationLogs.clear()
}

const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s === '--help' || s === '') {
    return { type: 'text', value: HELP }
  }

  const jsonOutput = s.includes('--json')
  const projectMatch = s.match(/--project\s+(\S+)/)
  const projectPath = projectMatch?.[1] || process.cwd()

  // 解析子命令 (排除 -- 开头的标志)
  const parts = s.split(/\s+/).filter(p => !p.startsWith('--'))
  const subcommand = parts[0] === 'spec-workflow' ? (parts[1] || '') : parts[0]

  try {
    switch (subcommand) {
      case 'guide': {
        const guide = getSpecWorkflowGuide()
        if (jsonOutput) {
          return { type: 'text', value: JSON.stringify({ guide, type: 'spec-workflow-guide' }, null, 2) }
        }
        return { type: 'text', value: guide }
      }

      case 'steering': {
        const guide = getSteeringGuide()
        if (jsonOutput) {
          return { type: 'text', value: JSON.stringify({ guide, type: 'steering-guide' }, null, 2) }
        }
        return { type: 'text', value: guide }
      }

      case 'status': {
        // 在 status 后的下一个非标志参数是规格名
        const statusParts = s.split(/\s+/)
        const statusIdx = statusParts.indexOf('status')
        let specName = ''
        for (let i = statusIdx + 1; i < statusParts.length; i++) {
          if (!statusParts[i].startsWith('--')) {
            specName = statusParts[i]
            break
          }
        }
        if (!specName) {
          return { type: 'text', value: 'Error: spec-workflow status requires a spec name\n\nUsage: /spec-workflow status <spec-name>' }
        }
        registerSpec(specName)
        const status = getSpecStatus(specName)
        if (!status) {
          return { type: 'text', value: `Error: Specification '${specName}' not found` }
        }
        if (jsonOutput) {
          return { type: 'text', value: JSON.stringify(status, null, 2) }
        }
        return { type: 'text', value: formatSpecStatus(status) }
      }

      case 'approvals': {
        const actionParts = s.split(/\s+/)
        const actionIdx = actionParts.indexOf('approvals')
        let action = ''
        for (let i = actionIdx + 1; i < actionParts.length; i++) {
          if (!actionParts[i].startsWith('--')) {
            action = actionParts[i]
            break
          }
        }
        if (!action) {
          return { type: 'text', value: 'Error: approvals requires an action (request/status/delete)\n\nUsage: /spec-workflow approvals <action> [--title "..."] [--file "..."] [--id "..."]' }
        }

        switch (action) {
          case 'request': {
            const titleMatch = s.match(/--title\s+"([^"]+)"/) || s.match(/--title\s+'([^']+)'/)
            const fileMatch = s.match(/--file\s+(\S+)/)
            const typeMatch = s.match(/--type\s+(document|action)/)
            const categoryMatch = s.match(/--category\s+(spec|steering)/)
            const categoryNameMatch = s.match(/--category-name\s+"([^"]+)"/) || s.match(/--category-name\s+'([^']+)'/)

            if (!titleMatch || !fileMatch) {
              return { type: 'text', value: 'Error: approvals request requires --title and --file' }
            }

            const approval: ApprovalRequest = {
              id: generateId(),
              title: titleMatch[1],
              type: typeMatch?.[1] || 'document',
              category: categoryMatch?.[1] || 'spec',
              categoryName: categoryNameMatch?.[1] || 'unknown',
              status: 'pending',
              createdAt: now(),
            }
            memoryStore.approvals.set(approval.id, approval)

            if (jsonOutput) {
              return { type: 'text', value: JSON.stringify({ success: true, approval, nextSteps: ['Wait for user review and approval'] }, null, 2) }
            }
            return { type: 'text', value: `# Approval Request Created\n\n**ID**: ${approval.id}\n**Title**: ${approval.title}\n**Type**: ${approval.type}\n**Status**: pending\n**File**: ${fileMatch[1]}\n\nWaiting for approval...\n` }
          }

          case 'status': {
            const idMatch = s.match(/--id\s+(\S+)/)
            if (!idMatch) {
              // 列出所有审批
              if (jsonOutput) {
                const all = Array.from(memoryStore.approvals.values())
                return { type: 'text', value: JSON.stringify({ approvals: all }, null, 2) }
              }
              return { type: 'text', value: formatApprovalsList() }
            }
            const approval = memoryStore.approvals.get(idMatch[1])
            if (!approval) {
              return { type: 'text', value: `Error: Approval '${idMatch[1]}' not found` }
            }
            if (jsonOutput) {
              return { type: 'text', value: JSON.stringify(approval, null, 2) }
            }
            return { type: 'text', value: `# Approval Status\n\n**ID**: ${approval.id}\n**Title**: ${approval.title}\n**Status**: ${approval.status}\n**Created**: ${approval.createdAt}\n` }
          }

          case 'delete': {
            const deleteIdMatch = s.match(/--id\s+(\S+)/)
            if (!deleteIdMatch) {
              return { type: 'text', value: 'Error: approvals delete requires --id' }
            }
            const deleted = memoryStore.approvals.delete(deleteIdMatch[1])
            if (!deleted) {
              return { type: 'text', value: `Error: Approval '${deleteIdMatch[1]}' not found` }
            }
            if (jsonOutput) {
              return { type: 'text', value: JSON.stringify({ success: true, deleted: deleteIdMatch[1] }, null, 2) }
            }
            return { type: 'text', value: `# Approval Deleted\n\nApproval '${deleteIdMatch[1]}' has been removed.\n` }
          }

          default:
            return { type: 'text', value: `Error: Unknown approvals action '${action}'\n\nValid actions: request, status, delete` }
        }
      }

      case 'log': {
        // log 后的非标志参数是 task-id
        const logParts = s.split(/\s+/)
        const logIdx = logParts.indexOf('log')
        let taskId = ''
        for (let i = logIdx + 1; i < logParts.length; i++) {
          if (!logParts[i].startsWith('--')) {
            taskId = logParts[i]
            break
          }
        }
        if (!taskId) {
          return { type: 'text', value: 'Error: spec-workflow log requires a task ID\n\nUsage: /spec-workflow log <task-id> --task "description" --type feature' }
        }
        const taskMatch = s.match(/--task\s+"([^"]+)"/) || s.match(/--task\s+'([^']+)'/)
        const typeMatch = s.match(/--type\s+(\S+)/)

        const logEntry = {
          taskId,
          task: taskMatch?.[1] || 'Unknown task',
          type: typeMatch?.[1] || 'feature',
          loggedAt: now(),
        }

        if (!memoryStore.implementationLogs.has(taskId)) {
          memoryStore.implementationLogs.set(taskId, [])
        }
        memoryStore.implementationLogs.get(taskId)!.push(logEntry)

        if (jsonOutput) {
          return { type: 'text', value: JSON.stringify({ success: true, log: logEntry }, null, 2) }
        }
        return { type: 'text', value: `# Implementation Logged\n\n**Task ID**: ${taskId}\n**Task**: ${logEntry.task}\n**Type**: ${logEntry.type}\n**Logged At**: ${logEntry.loggedAt}\n\nThis log will help future agents discover existing implementations.\n` }
      }

      default:
        return { type: 'text', value: `Error: Unknown subcommand '${subcommand}'\n\n${HELP}` }
    }
  } catch (error) {
    return {
      type: 'text',
      value: `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${HELP}`,
    }
  }
}

const specWorkflow: Command = {
  type: 'local',
  name: 'spec-workflow',
  description: '规格驱动开发工作流 — 支持 guide/status/approvals/log/steering',
  aliases: ['spec-workflow', 'sw'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { call }
export default specWorkflow
