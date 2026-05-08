export function getEnterWorktreeToolPrompt(): string {
  return `仅在用户明确要求在工作树中工作时使用此工具。此工具创建一个隔离的 git 工作树，并将当前会话切换到其中。

## 何时使用

- 用户明确提到“工作树”（例如“启动一个工作树”、“在工作树中工作”、“创建工作树”、“使用工作树”）

## 何时不应使用

- 用户要求创建分支、切换分支或在其他分支上工作——请改用 git 命令
- 用户要求修复 bug 或开发功能——使用常规 git 工作流，除非他们特别提到工作树
- 除非用户明确提到“工作树”，否则切勿使用此工具

## 要求

- 必须处于 git 仓库中，或者在 settings.json 中配置了 WorktreeCreate/WorktreeRemove 钩子
- 不能已经处于工作树中

## 行为

- 在 git 仓库中：在 \`.claude/worktrees/\` 内创建一个基于 HEAD 的新分支的新 git 工作树
- 在 git 仓库外：委托给 WorktreeCreate/WorktreeRemove 钩子以实现与版本控制系统无关的隔离
- 将会话的工作目录切换到新的工作树
- 使用 ExitWorktree 在会话中途离开工作树（可选择保留或删除）。会话退出时，如果仍处于工作树中，将提示用户保留或删除

## 参数

- \`name\`（可选）：工作树的名称。如未提供，则生成随机名称。
`
}