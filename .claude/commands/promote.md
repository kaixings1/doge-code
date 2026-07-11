---
description: 将代码从一个环境升级到下一个环境
---

将所有代码从一个环境升级到下一个环境。用法: `/promote [source] [target]`

解析 `$ARGUMENTS` 以提取：
- **源环境**：可选（例如 "develop", "staging"）。如果省略，自动检测。
- **目标环境**：可选。如果省略，使用提升流程中的下一个环境。

## 步骤 1：确定源和目标

如果未指定，基于当前分支自动检测：

| 当前分支 | 源 | 目标 |
|---|---|---|
| `develop` | develop | staging |
| `staging` | staging | production 分支 |

如果同时指定了两个参数（例如 `/promote staging production`），直接使用它们。

确定实际的分支名称——不要硬编码。检查项目的 CLAUDE.md 或使用 `git branch -r` 查找匹配的环境分支。

## 步骤 2：显示将要升级的内容

比较源分支和目标分支以显示新内容：

```bash
git log <target-branch>..<source-branch> --oneline
```

展示变更：

```
## 升级 {source} → {target}

要升级的提交：
| 提交 | 消息 | 工作项 |
|--------|---------|-----------|
| abc1234 | 添加支付导出 | AB#1234 |
| def5678 | 修复登录重定向 | AB#1235 |
| ghi9012 | 更新仪表盘 | AB#1236 |

{count} 个提交将从 {source} 升级到 {target}。
是否升级？（是/否）
```

如果没有新提交，报告环境已经同步。

等待确认。

## 步骤 3：创建 PR

通过 Azure DevOps MCP 直接从源分支向目标分支创建 PR：

- **sourceRefName**: `refs/heads/<源分支>`
- **targetRefName**: `refs/heads/<目标分支>`
- **title**: `升级 {source} → {target}`
- **description**: 列出所有正在升级的提交和关联工作项

将所有关联的工作项链接到 PR。

## 步骤 4：展示摘要

```
升级 PR 已创建：{source} → {target}

PR: {pr-url}

包含 {count} 个提交。
合并 PR 以触发 {target} 的 CD 流水线。
合并后记得在 Azure DevOps 中更新工作项状态。
```

不要自动合并 PR——用户或审查者必须批准并合并。
