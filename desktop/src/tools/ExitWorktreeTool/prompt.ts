export function getExitWorktreeToolPrompt(): string {
  return `退出由 EnterWorktree 创建的工作树会话，恢复到原始工作目录。

## 作用范围

本工具仅作用于当前会话中由 EnterWorktree 创建的工作树，不会触及：
- 你手动执行 \`git worktree add\` 创建的工作树
- 之前会话中创建的工作树（即使由 EnterWorktree 创建）
- 未调用过 EnterWorktree 的目录

若在非 EnterWorktree 会话中调用，本工具为**空操作**：仅报告无活跃工作树会话，不执行任何文件系统变更。

## 使用时机

- 用户明确要求“退出工作树”、“离开工作树”、“返回原目录”或表示要结束工作树会话时
- 请勿主动调用，仅响应用户请求

## 参数

- \`action\`（必填）：\`"keep"\` 或 \`"remove"\`
  - \`"keep"\` — 保留工作树目录及其分支。适用于用户后续仍需使用或需保留其中更改的情况。
  - \`"remove"\` — 删除工作树目录及对应分支。适用于任务已完成或已放弃，需要干净退出时。
- \`discard_changes\`（可选，默认 false）：仅在 \`action: "remove"\` 时生效。若工作树存在未提交文件或未合入原分支的提交，工具将**拒绝删除**，除非将此参数设为 \`true\`。若工具返回错误列出了待处理更改，请与用户确认后再附带 \`discard_changes: true\` 重试。

## 行为

- 将会话工作目录恢复至调用 EnterWorktree 前的路径
- 清除依赖当前工作目录的缓存（系统提示片段、记忆文件、计划目录），确保会话状态反映原目录内容
- 若工作树关联了 tmux 会话：\`remove\` 时终止该会话，\`keep\` 时保留运行（返回会话名以便用户重新接入）
- 退出后，可再次调用 EnterWorktree 创建新的工作树
`
}