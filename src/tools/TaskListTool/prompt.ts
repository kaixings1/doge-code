import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = '列出任务列表中的所有任务'

export function getPrompt(): string {
  const teammateUseCase = isAgentSwarmsEnabled()
    ? `- 在向队友分配任务之前，查看有哪些可用任务
`
    : ''

  const idDescription = isAgentSwarmsEnabled()
    ? '- **id**: 任务标识符（配合 TaskGet、TaskUpdate 使用）'
    : '- **id**: 任务标识符（配合 TaskGet、TaskUpdate 使用）'

  const teammateWorkflow = isAgentSwarmsEnabled()
    ? `
## 队友工作流

作为队友工作时：
1. 完成当前任务后，调用 TaskList 查找可用工作
2. 查找状态为 'pending'、无所有者且 blockedBy 为空的任务
3. 当有多个任务可用时，**优先选择 ID 最小的任务**，因为较早的任务通常会为后续任务建立上下文
4. 使用 TaskUpdate 认领可用任务（将 \`owner\` 设置为你的名称），或等待领导者分配
5. 如果受阻，专注于解除阻塞任务或通知团队领导
`
    : ''

  return `使用此工具列出任务列表中的所有任务。

## 何时使用此工具

- 查看有哪些可处理的任务（状态：'pending'，无所有者，未被阻塞）
- 检查项目的整体进度
- 查找被阻塞且需要解决依赖关系的任务
${teammateUseCase}- 完成任务后，检查新解除阻塞的工作或认领下一个可用任务
- 当有多个任务可用时，**优先处理 ID 较小的任务**，因为较早的任务通常会为后续任务建立上下文

## 输出

返回每个任务的摘要：
${idDescription}
- **subject**: 任务的简要描述
- **status**: 'pending'（待处理）、'in_progress'（进行中）或 'completed'（已完成）
- **owner**: 如果已分配，则为智能体标识符；如果可用，则为空
- **blockedBy**: 必须首先解决的未完成任务 ID 列表（在依赖项解决之前，无法认领带有 blockedBy 的任务）

使用 TaskGet 并指定特定任务 ID 可查看完整详情，包括描述和评论。
${teammateWorkflow}`
}