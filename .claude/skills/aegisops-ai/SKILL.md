---
name: aegisops-ai
description: "自主 DevSecOps 和 FinOps 护栏。编排 Gemini 3 Flash 来审计 Linux 内核补丁、Terraform 成本漂移和 K8s 合规性。"
risk: safe
source: community
author: Champbreed
date_added: "2026-03-24"
---

# /aegisops-ai — 自主治理编排器

AegisOps-AI 是一个专业级的"活管道"，
它将高级 AI 推理直接集成到
SDLC 中。它充当系统级安全、
云基础设施成本和
Kubernetes 合规性的智能守门员。

## 目标

通过以下方式自动化高风险安全和财务审计：
1. 识别 Linux 内核补丁中基于逻辑的漏洞（UAF、陈旧状态）。
2. 检测 Terraform 计划中的大规模"静默灾难"成本漂移。
3. 将自然语言安全意图转化为强化的 K8s 清单。

## 使用场景
- **内核补丁审查：** 审核原始的基于 C 的 Git 差异以确保内存安全。
- **预应用 IaC 审计：** 分析 `terraform plan` 输出以防止账单激增。
- **集群强化：** 为部署生成"最小权限"安全上下文。
- **CI/CD 质量门控：** 通过 GitHub Actions 阻止不合规的合并。

## 何时不使用

- **Web 应用逻辑：** 不要用于标准的 Web 漏洞（XSS、SQLi）；使用专门的 SAST 扫描器。
- **非 C 内存分析：** 补丁分析器针对 C 逻辑优化；避免用于 Python 或 JS 等高级语言。
- **直接资源变更：** 这是一个*审计器*，不是部署工具。它不执行 `terraform apply` 或 `kubectl apply`。
- **事后分析：** 要分析*为什么*之前的 AI 会话失败，请改用 `/analyze-project`。
