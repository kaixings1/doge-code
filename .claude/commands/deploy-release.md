---
description: 将发布部署到下一个环境
---

将发布部署到下一个环境。用法: `/deploy-release <release-number> [environment]`

解析 `$ARGUMENTS` 以提取：
- **发布编号**：必填（例如 "23" 或 "#23"）
- **目标环境**：可选——如果未提供，自动检测提升流程中的下一个环境

## 步骤 1：读取发布

使用 `search_workitem` 或 `wit_get_work_items_for_iteration` 查询 Azure DevOps 中标记为 `release-{N}` 或分配给 `Release #{N}` 迭代的所有工作项。

展示发布内容：

```
## 发布 #{N} — 部署到 {environment}

| ID | 类型 | 标题 | 状态 | 分支 |
|----|------|-------|-------|--------|
| AB#1234 | 用户故事 | 添加支付导出 | 准备测试 | story/AB#1234-add-payment-export |
| AB#1235 | Bug | 修复登录重定向 | 准备测试 | bugfix/AB#1235-fix-login-redirect |

此发布中有 {count} 个工作项。
```

如果未找到工作项，停止并报告错误。

## 步骤 2：确定目标环境

如果用户指定了环境，使用它。否则通过检查工作项当前所在环境自动检测：

| 当前状态 | 下一个环境 |
|---|---|
| 工作项已合并到 `develop` | 部署到 **staging** |
| 工作项已合并到 `staging` | 部署到 **production** |

使用 `repo_search_commits`（`includeWorkItems: true`）检查这些工作项的提交位于哪个环境分支。

**验证：** 确认发布中的所有工作项在同一个源分支上有提交。如果不一致（例如 AB#1234 在 `develop` 上但 AB#1235 没有提交），展示警告，列出哪些工作项在哪些分支上，并让用户明确确认目标环境。

向用户确认：

```
将发布 #{N}（{count} 个工作项）部署到 {environment}？

此操作将：
1. 创建发布分支：release/{N}-to-{environment}
2. 挑选 {count} 个工作项的所有提交
3. 创建针对 {environment} 分支的 PR

继续？（是/否）
```

等待确认。

## 步骤 3：创建发布分支

确定目标环境分支。不要硬编码分支名称——检查项目的 CLAUDE.md 或使用分支到环境的映射：

```bash
# 切换到目标环境分支并拉取最新代码
git checkout <target-environment-branch>
git pull origin <target-environment-branch>

# 创建发布分支
git checkout -b release/{N}-to-<environment>
```

## 步骤 4：挑选工作项提交

对于发布中的每个工作项：

1. 使用 `repo_search_commits`（`includeWorkItems: true`）或在提交消息中搜索 `AB#{id}` 查找关联提交
2. 按时间顺序挑选每个提交：
   ```bash
   git cherry-pick <commit-hash>
   ```
3. 如果出现冲突，停止并报告。不要自动解决。展示恢复选项：

```
在挑选 AB#1236（提交 ghi9012）时发生冲突

冲突文件：
- src/API/Controllers/HistoryController.cs

选项：
1. 跳过此工作项并继续处理其余部分
2. 中止整个发布部署并清理
3. 我手动解决冲突——请等待

选择哪个选项？（1 / 2 / 3）
```

- **选项 1：** 运行 `git cherry-pick --skip` 并继续。在摘要中注明跳过的项。
- **选项 2：** 运行 `git cherry-pick --abort`，删除发布分支，切换回去。报告哪些项**未**部署。
- **选项 3：** 等待用户解决并运行 `git cherry-pick --continue`，然后继续。

跟踪进度：

```
正在为发布 #{N} 挑选提交：
[x] AB#1234: 添加支付导出（3 个提交）
[x] AB#1235: 修复登录重定向（1 个提交）
[ ] AB#1236: 查看历史（2 个提交）— 冲突
```

## 步骤 5：推送并创建 PR

1. 推送发布分支：`git push -u origin HEAD`
2. 通过 Azure DevOps MCP 创建 PR：
   - **sourceRefName**: `refs/heads/release/{N}-to-<environment>`
   - **targetRefName**: `refs/heads/<target-environment-branch>`
   - **title**: `发布 #{N} → {Environment}`
   - **description**: 列出包含的所有工作项及其 ID 和标题
3. 通过 `wit_link_work_item_to_pull_request` 将所有工作项链接到 PR

## 步骤 6：展示摘要

```
已为 {environment} 创建发布 #{N} PR。

PR: {pr-url}
分支：release/{N}-to-{environment} → {target-branch}

包含的工作项：
- AB#1234: 添加支付导出
- AB#1235: 修复登录重定向
- AB#1236: 查看历史

后续步骤：
- 审查并批准 PR
- 合并触发 {environment} 的 CD 流水线
- 合并后在 Azure DevOps 中更新工作项状态
```

不要触发 CD 流水线——它在 PR 合并时自动触发。

## 步骤 7：通知团队（如果配置了 Teams MCP）

通过 Microsoft Teams MCP 服务器向项目的 Teams 频道发送通知：

```
🚀 已为 {environment} 创建发布 #{N} PR
PR: {pr-url}
工作项：AB#1234, AB#1235, AB#1236
等待审查和合并。
```

如果未配置 Teams MCP 服务器，静默跳过此步骤。
