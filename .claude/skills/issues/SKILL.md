---
name: Issues 管理
description: "Issues 管理 — GitHub Issues 创建、查看和管理相关功能"
allowed-tools: Bash(gh *)
risk: unknown
source: community
metadata:
  author: Shpigford
  version: "1.0"
---
# Issues — GitHub Issues 交互
与 GitHub Issues 进行交互——创建、列出和查看问题。
## 何时使用
- 用户想要创建、列出、查看或以其他方式处理 GitHub Issues
- 任务涉及通过 GitHub CLI 工作流进行问题处理和仓库问题管理
- 你需要一个引导式问题流程，在运行命令之前收集标题、描述和操作选择
## 操作指南
此命令帮助您使用 gh CLI 处理 GitHub Issues。
### 步骤 1：确定操作
使用 AskUserQuestion 询问用户想要做什么：
**问题：**
- question: "您想对 GitHub Issues 做什么？"
- header: "操作"
- multiSelect: false
- options:
  - label: "创建新 Issue"
    description: "使用标题、正文和可选标签打开新 Issue"
  - label: "列出 Issues"
    description: "查看当前仓库中的开放 Issues"
  - label: "查看 Issue"
    description: "按编号查看特定 Issue 的详情"
