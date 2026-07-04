---
name: kubernetes-patterns
description: "Kubernetes Patterns — Kubernetes Patterns 相关功能和最佳实践"
metadata:
  origin: ECC
---

# Kubernetes 模式

用于可靠部署、管理和调试工作负载的生产级 Kubernetes 模式。

## 何时激活

- 编写 Kubernetes 清单（部署、服务、入口、作业）
- 配置资源请求/限制、存活/就绪探针
- 设置 RBAC、命名空间或服务账户
- 在 K8s 中管理配置和密钥
- 调试 CrashLoopBackOff、OOMKilled、挂起 pod 或镜像拉取错误
- 配置 HPA（水平 Pod 自动扩缩器）或 Pod 中断预算
- 审查 K8s YAML 的安全性或正确性

## 何时使用

> 与上面的**何时激活**相同。此别名满足仓库技能格式约定。在编写、审查或调试 Kubernetes YAML 和工作负载的任何时候使用此技能。

## 工作原理

此技能提供按任务组织的**可复制粘贴的生产级 YAML 模式**和 **kubectl 调试命令**：

1. **部署模板** — 完全配置的生产 `Deployment`，包含安全上下文、滚动更新策略、所有三种探针类型、资源限制以及来自 ConfigMap/Secret 的环境注入。
2. **探针** — 启动、存活和就绪探针的决策表，包含正确的 `failureThreshold × periodSeconds` 计算。
3. **服务与入口** — 带有 cert-manager 注解的 ClusterIP、LoadBalancer 和 TLS 入口模式。
4. **ConfigMap 与 Secret** — `envFrom`、文件挂载和外部密钥指导。
5. **资源管理** — 按工作负载类型（Web API、JVM、工作器、边车）的经验法则：请求与限制。
6. **RBAC** — 最小权限服务账户 → 角色 → 角色绑定链。
7. **HPA 与 PDB** — 自动扩缩和节点排空安全配置。
8. **作业与定时作业** — 具有正确 `restartPolicy` 的一次性和计划工作负载模式。
9. **kubectl 速查表** — 日志、执行、回滚、端口转发、试运行和常见错误诊断命令。
10. **反模式与清单** — 不应做什么，以及安全/可靠性/可观察性清单。

## 示例

请参阅下面的完整可运行示例。快速参考：

| 任务 | 跳转到 |