import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = '列出任务列表中的所有任。

export function getPrompt(): string {
  const teammateUseCase = isAgentSwarmsEnabled()
    ? `- Before assigning tasks to teammates, to see what's available
`
    : ''

  const idDescription = isAgentSwarmsEnabled()
    ? '- **id**: Task identifier (use with TaskGet, TaskUpdate)'
    : '- **id**: Task identifier (use with TaskGet, TaskUpdate)'

  const teammateWorkflow = isAgentSwarmsEnabled()
    ? `
## Teammate Workflow

When working as a teammate:
1. After completing your current task, call TaskList to find available work
2. Look for tasks with status 'pending', no owner, and empty blockedBy
3. **Prefer tasks in ID order** (lowest ID first) when multiple tasks are available, as earlier tasks often set up context for later ones
4. Claim an available task using TaskUpdate (set \`owner\` to your name), or wait for leader assignment
5. If blocked, focus on unblocking tasks or notify the team lead
`
    : ''

  return `使用此工具列出任务列表中的所有任务。

## 何时使用此工。

- 查看有哪些任务可以处理（状态：'pending'，没有所有者，未被阻塞。
- 检查项目的总体进度
- 查找被阻塞且需要解决依赖关系的任务
${teammateUseCase}- 完成任务后，检查新解除阻塞的工作或认领下一个可用任。
- **优先）ID 顺序处理任务**（ID 最小的优先），因为早期任务通常为后续任务设置上下文

## 输出

返回每个任务的摘要：
${idDescription}
- **subject**：任务的简要描。
- **status**）pending'）in_progress' ）'completed'
- **owner**：如果已分配则为代理 ID，为空则表示可用
- **blockedBy**：必须先解决的开放任）ID 列表（有 blockedBy 的任务在依赖解决之前不能被认领）

使用 TaskGet 和特定任）ID 查看完整详情，包括描述和注释。
${teammateWorkflow}`
}
