---
description: 提交、推送并部署当前更改
---

提交、推送并部署当前更改。用法：`/deploy [提交信息]`

`$ARGUMENTS` 是可选的提交信息。如果未提供，根据更改自动生成。

## 第 1 步：前置检查

1. 在任何修改过的 .NET 项目上运行 `dotnet build`
2. 如果前端文件有变更，在相关客户端目录中运行 `npx tsc --noEmit`
3. 如果任一检查失败，**停止**并报告错误 —— 不要部署有问题的代码

## 第 2 步：审查变更

```bash
git status --short
git diff --stat
```

呈现变更：

```
## 待部署的更改

| 状态 | 文件 |
|------|------|
| M | src/API/Controllers/PaymentController.cs |
| M | src/Application/Payments/ExportHandler.cs |
| A | src/Domain/Payments/ExportResult.cs |

{count} 个文件变更。是否部署？（是/否）
```

等待确认。

## 第 3 步：提交

1. 仅暂存相关文件（绝不要使用 `git add -A`）
2. 绝不要暂存 `.env`、包含真实密钥的 `appsettings.*.json` 或 `node_modules`
3. 使用提供的信息或自动生成的信息提交
4. 始终以 `Co-Authored-By: kaixings <30445355@qq.com>` 结尾
5. 使用 HEREDOC 格式编写提交信息

## 第 4 步：推送

```bash
git push -u origin HEAD
```

仅推送当前分支。不要交叉推送到其他分支。

## 第 5 步：流水线（条件性）

检查当前分支是否是环境分支（CD 流水线监视的分支）：

- **在环境分支上**：通过 Azure DevOps MCP 触发相应的 CD 流水线。监控构建并报告状态。
- **在功能/工作分支上**：不触发。报告流水线将在 PR 合并时触发。

## 第 6 步：报告

```
部署成功。

分支：{branch}
提交：{hash} - {message}
流水线：{已触发 | 将在 PR 合并时触发}
```
