---
description: 将特定工作项挑选到目标环境
---

将特定工作项挑选到目标环境。用法: `/cherry-pick <work-item-ids> <environment>`

解析 `$ARGUMENTS` 以提取：
- **工作项 ID**：一个或多个 ID（例如 "AB#1234 AB#1235" 或 "1234, 1235"）
- **目标环境**：要部署到的环境（例如 "staging", "production"）

## 步骤 1：读取工作项

通过 MCP 从 Azure DevOps 获取每个工作项。展示列表：

```
## 挑选到 {environment}

| ID | 类型 | 标题 | 状态 |
|----|------|-------|-------|
| AB#1234 | 用户故事 | 添加支付导出 | 准备测试 |
| AB#1235 | Bug | 修复登录重定向 | 准备测试 |

将 {count} 个工作项挑选到 {environment}？（是/否）
```

等待确认。

## 步骤 2：查找提交

对于每个工作项，使用 `repo_search_commits`（`includeWorkItems: true`）查找关联的提交，或在源分支的提交消息中搜索 `AB#{id}`。

如果某个工作项未找到关联提交，则停止并报告哪个工作项没有关联提交。

## 步骤 3：创建挑选分支

确定目标环境分支。不要硬编码分支名称——检查项目的 CLAUDE.md 或流水线配置。

```bash
git checkout <target-environment-branch>
git pull origin <target-environment-branch>
git checkout -b cherry-pick/<date>-to-<environment>
```

## 步骤 4：挑选提交

按时间顺序为每个工作项挑选提交：

```bash
git cherry-pick <commit-hash>
```

如果出现冲突，停止并报告。不要自动解决。展示恢复选项：

```
在挑选 AB#1235（提交 def5678）时发生冲突

冲突文件：
- src/API/Controllers/PaymentController.cs

选项：
1. 跳过此工作项并继续处理其余部分
2. 中止整个挑选操作并清理
3. 我手动解决冲突——请等待

选择哪个选项？（1 / 2 / 3）
```

- **选项 1：** 运行 `git cherry-pick --skip` 并继续处理剩余工作项。在摘要中注明跳过的项。
- **选项 2：** 运行 `git cherry-pick --abort`，删除挑选分支，并切换回原始分支。
- **选项 3：** 等待用户解决冲突并运行 `git cherry-pick --continue`，然后继续。

跟踪进度：
```
正在挑选：
[x] AB#1234: 添加支付导出（2 个提交）
[ ] AB#1235: 修复登录重定向（1 个提交）— 冲突
```

## 步骤 5：推送并创建 PR

1. 推送：`git push -u origin HEAD`
2. 通过 Azure DevOps MCP 创建 PR：
   - **sourceRefName**: `refs/heads/cherry-pick/<date>-to-<environment>`
   - **targetRefName**: `refs/heads/<target-environment-branch>`
   - **title**: `挑选 AB#1234, AB#1235 → {Environment}`
   - **description**: 列出所有工作项及其 ID 和标题
3. 通过 `wit_link_work_item_to_pull_request` 将所有工作项链接到 PR

## 步骤 6：展示摘要

```
已为 {environment} 创建挑选 PR。

PR: {pr-url}
工作项：
- AB#1234: 添加支付导出
- AB#1235: 修复登录重定向

合并 PR 以触发 {environment} 的 CD 流水线。
```
