import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = '在任务列表中创建新任。

export function getPrompt(): string {
  const teammateContext = isAgentSwarmsEnabled()
    ? ' 并可能分配给队友'
    : ''

  const teammateTips = isAgentSwarmsEnabled()
    ? `- 在描述中包含足够的细节，以便其他代理能够理解和完成任。
- 新任务以状）'pending' 创建且没有所有）—）使用 TaskUpdate ）\`owner\` 参数来分配任。
`
    : ''

  return `使用此工具为当前编码会话创建结构化任务列表。这有助于你跟踪进度、组织复杂任务并向用户展示细致入微。
它还能帮助用户了解任务进度以及其请求的总体进展。

## 何时使用此工。

在以下场景中主动使用此工具：

- 复杂的多步骤任务 —）当任务需）3 个或更多不同的步骤或操作。
- 非平凡和复杂的任）—）需要仔细规划或多个操作的任）{teammateContext}
- 计划模式 —）在使用计划模式时，创建任务列表来跟踪工作
- 用户明确要求待办列表 —）当用户直接要求你使用待办列表。
- 用户提供多个任务 —）当用户提供待完成事项列表时（编号或逗号分隔。
- 收到新指示后 —）立即将用户需求捕获为任务
- 开始处理任务时 —）在开始工作之前将其标记为 in_progress
- 完成任务）—）将其标记为已完成，并添加在实施过程中发现的任何新的后续任。

## 何时不使用此工具

在以下情况下跳过使用此工具：
- 只有一个简单的任务
- 任务微不足道，跟踪它没有组织效益
- 任务可以在少）3 个简单步骤内完成
- 任务纯粹是对话性或信息性的

注意：如果只有一个微不足道的任务要做，你不应该使用此工具。在这种情况下，你最好直接完成任务。

## 任务字段

- **subject**：简短的、祈使句形式的可操作标题（例）修复登录流程中的身份验证漏洞"。
- **description**：需要做什。
- **activeForm**（可选）：任务处）in_progress 状态时在加载指示器中显示的现在进行式形式（例如"正在修复身份验证漏洞"）。如果省略，加载指示器将显示 subject。

所有任务都以状）\`pending\` 创建。

## 提示

- 创建具有明确、具）subject 的任务，描述期望的结。
- 创建任务后，如果需要，使用 TaskUpdate 设置依赖关系（blocks/blockedBy。
${teammateTips}- 先检）TaskList 以避免创建重复任。
`
}
