---
description: 回滚环境中的部署
---

回滚环境中的部署。用法: `/rollback <work-item-ids-or-commit> <environment>`

解析 `$ARGUMENTS` 以提取：
- **要恢复的内容**：工作项 ID（例如 "AB#1234"）或提交哈希，或 "last" 表示最近一次部署
- **目标环境**：要回滚到的环境（例如 "staging", "production"）

## 步骤 1：识别要恢复的内容

确定目标环境分支。不要硬编码分支名称。

如果用户指定：
- **工作项 ID**：使用 `repo_search_commits`（`includeWorkItems: true`）在环境分支上查找关联的提交
- **提交哈希**：直接使用
- **"last"**：通过 `git log --merges -1 <branch>` 查找环境分支上最近的合并提交

展示恢复计划：

```
## 在 {environment} 上回滚

要恢复的提交：
| 提交 | 消息 | 工作项 |
|--------|---------|-----------|
| abc1234 | 添加支付导出 | AB#1234 |
| def5678 | 修复登录重定向 | AB#1235 |

这将在 {environment} 上恢复 {count} 个提交。继续？（是/否）
```

等待确认。

## 步骤 2：创建恢复分支

```bash
git checkout <target-environment-branch>
git pull origin <target-environment-branch>
git checkout -b revert/<date>-on-<environment>
```

## 步骤 3：恢复提交

按时间倒序（最新的最先）恢复每个提交：

```bash
git revert --no-commit <commit-hash>
```

所有恢复暂存后，创建一个单一的提交：

```bash
git commit -m "$(cat <<'EOF'
在 {environment} 上恢复 AB#1234, AB#1235

已恢复的提交：
- abc1234: 添加支付导出
- def5678: 修复登录重定向

Co-Authored-By: kaixings <30445355@qq.com>
EOF
)"
```

## 步骤 4：验证

对恢复后的代码运行预检检查：
1. 在任何 .NET 项目上运行 `dotnet build`
2. 在任何前端项目上运行 `npx tsc --noEmit`
3. 如果任一检查失败，停止并报告——恢复可能引入了不一致

## 步骤 5：推送并创建 PR

1. 推送：`git push -u origin HEAD`
2. 通过 Azure DevOps MCP 创建 PR：
   - **sourceRefName**: `refs/heads/revert/<date>-on-<environment>`
   - **targetRefName**: `refs/heads/<target-environment-branch>`
   - **title**: `回滚：在 {Environment} 上恢复 AB#1234, AB#1235`
   - **description**: 列出已恢复的提交和原因
3. 将工作项链接到 PR

## 步骤 6：展示摘要

```
已为 {environment} 创建回滚 PR。

PR: {pr-url}
已恢复：
- AB#1234: 添加支付导出
- AB#1235: 修复登录重定向

合并 PR 以触发 CD 流水线并部署回滚。
```

对于生产环境回滚，向用户标记紧急性。

## 步骤 7：通知团队（如果配置了 Teams MCP）

通过 Microsoft Teams MCP 服务器向项目的 Teams 频道发送通知：

```
⚠️ 已为 {environment} 创建回滚 PR
PR: {pr-url}
正在恢复：AB#1234, AB#1235
等待审查和合并。
```

对于生产环境回滚，将消息标记为紧急。如果未配置 Teams MCP 服务器，静默跳过此步骤。
