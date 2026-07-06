---
name: kubestellar-console
description: "通过 MCP 服务器和 10+ 内置代理技能实现 AI 驱动的多集群 Kubernetes 仪表板"
category: devops
risk: critical
source: community
source_repo: kubestellar/console
source_type: community
date_added: "2026-04-27"
author: kubestellar
tags: [kubernetes, multi-cluster, mcp, dashboard, cncf, devops, observability]
tools: [claude, 游标, gemini, codex]
license: "Apache-2.0"
license_source: "https://github.com/kubestellar/console/blob/main/LICENSE"
plugin:
  设置:
    type: manual
    summary: "Requires kc-agent binary (brew tap kubestellar/tap && brew install kc-agent)"
    docs: "https://github.com/kubestellar/console#quick-start"
---

# KubeStellar Console

## 概述

KubeStellar Console 是一个开源的、支持 AI 驱动的多集群 Kubernetes 仪表板（CNCF 项目）。它附带 `kc-agent`，这是一个将编码代理连接到 kubeconfig 和 Kubernetes API 的 MCP 服务器，以及 10 多个用于开发、测试和操作的内置代理技能。

## 何时使用此技能

- 在跨边缘和云管理多个 Kubernetes 集群时使用
- 在需要 AI 辅助的 Kubernetes 故障排除和调试时使用
- 在 Kubernetes 仪表板上运行性能测试、缓存合规性检查或 CI 调试时使用
- 在与 CNCF 项目（Argo、Kyverno、Istio 等 20 多个）集成时使用

## 工作原理

### 步骤 1: 安装 kc-agent

```bash
brew tap kubestellar/tap && brew install kc-agent
```

### 步骤 2: 启动 MCP 服务器

```bash
kc-agent
```

这将活动 kubeconfig 上下文桥接到任何兼容 MCP 的编码代理。除非用户明确接受该风险，否则不要从具有集群管理员或写入权限的上下文启动它。

### 步骤 3: 使用内置代理技能

该项目通过 `CLAUDE.md` 和 `AGENTS.md` 提供代理技能：

- **@perf-test** — 仪表板性能测试和 TTFI 分析
- **@cache-test** — 卡片缓存合规性测试（IndexedDB 热返回）
- **@nav-test** — 导航性能测试
- **@ui-compliance-test** — 卡片加载合规性（8 个标准，150+ 张卡片）
- **@ci-status** — CI 流水线监控和状态检查
- **@rca** — CI/测试失败的根因分析
- **@tdd** — 测试驱动开发工作流
- **@k8s-debug** — Kubernetes 调试和故障排除

## 主要特性

- 跨边缘和云的多集群管理
- 实时流式可观察性
- 20+ CNCF 项目集成（Argo、Kyverno、Istio 等）
- GitHub OAuth 认证
- 供应链安全（SBOM、SLSA）
- 使用陈旧重新验证模式的 SQLite WASM 缓存
- 15+ 主题，支持深色/浅色模式

## 安全与安全注意事项

- **关键风险：** `kc-agent` 将您的活动 kubeconfig 上下文桥接到兼容 MCP 的代理。如果该上下文具有集群管理员、写入权限或密钥读取访问权限，代理将继承这些能力。
- **不要仅依赖 RBAC 对象：** 创建 ServiceAccount 或 ClusterRoleBinding 不会更改 `kc-agent` 使用的凭据。只有在切换到专用最小权限凭据并验证它们之后，才启动 `kc-agent`。
- **推荐的只读范围：** 避免 `resources='*'`，因为它包括敏感对象（如 Secret）。首选明确列出非敏感资源，并在启动 MCP 服务器之前验证访问权限：
  ```bash
  kubectl create serviceaccount kc-agent -n default
  kubectl create clusterrole kc-agent-readonly \
    --verb=get,list,watch \
    --resource=pods,services,deployments.apps,replicasets.apps,statefulsets.apps,daemonsets.apps,namespaces,nodes,events,configmaps
  kubectl create clusterrolebinding kc-agent-readonly \
    --clusterrole=kc-agent-readonly \
    --serviceaccount=default:kc-agent
  kubectl auth can-i get secrets --as=system:serviceaccount:default:kc-agent
  kubectl auth can-i list pods --as=system:serviceaccount:default:kc-agent
  ```
- 第一个 `can-i` 命令必须返回 `no`；第二个应该返回 `yes`。然后在运行 `kc-agent` 之前创建或选择一个实际以该 ServiceAccount 身份认证的 kubeconfig。
- 不要在没有认证的情况下将 `kc-agent` 暴露在公共网络上。
- 查看 [SECURITY-AI.md](https://github.com/kubestellar/console/blob/main/docs/security/SECURITY-AI.md) 了解提示注入和代理漂移缓解措施。

## 限制

- 此技能需要单独通过 Homebrew 安装的外部二进制文件（`kc-agent`）。
- 不要将代理输出视为特定环境验证或专家评审的替代品。
- 如果所需的权限或安全边界不明确，请停止并请求澄清。

## Links

- [GitHub](https://github.com/kubestellar/console)
- [Website](https://console.kubestellar.io)
- [CLAUDE.md](https://github.com/kubestellar/console/blob/main/CLAUDE.md)
- [AGENTS.md](https://github.com/kubestellar/console/blob/main/AGENTS.md)
