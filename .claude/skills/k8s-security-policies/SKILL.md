---
name: Kubernetes 安全策略
description: "在 Kubernetes 中实施 NetworkPolicy、PodSecurityPolicy、RBAC 和 Pod Security Standards 的全面指南。"
risk: unknown
source: community
date_added: "2026-02-27"
---
# Kubernetes 安全策略

在 Kubernetes 中实施 NetworkPolicy、PodSecurityPolicy（PSP 已被 PSS 取代）、RBAC 和 Pod Security Standards 的全面指南。

## Pod 安全标准

Pod Security Standards (PSS) 提供三种预定义配置：

### 1. Privileged（无限制）

完全开放的 Pod 策略，仅用于系统组件或特殊用例。

```yaml
# namespace-label.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: privileged-ns
  labels:
    pod-security.kubernetes.io/enforce: privileged
```

- 允许特权容器
- 允许主机路径挂载
- 允许所有能力
- 适用于系统 DaemonSet

### 2. Baseline（最低限制）

防止已知特权提升攻击的最小限制。

```yaml
# namespace-label.yaml
metadata:
  labels:
    pod-security.kubernetes.io/enforce: baseline
```

限制：
- 禁止特权容器
- 禁止宿主 PID/IPC 命名空间共享
- 禁止允许所有能力
- 禁止危险卷类型（hostPath、hostPipe 等）
- 允许大多数正常应用工作负载

### 3. Restricted（最高限制）

当前最佳实践，遵循纵深防御原则。

```yaml
# namespace-label.yaml
metadata:
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/audit: restricted
```

额外限制：
- 强制非 root 用户运行
- 只读根文件系统
- 禁止特权提升
- 只读根文件系统和 dropping 所有能力

## 网络策略

NetworkPolicy 通过标签选择器控制 Pod 间通信。

### 默认拒绝所有

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: prod
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

### 允许前端到后端

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: prod
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
```

### 允许 DNS

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: prod
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

## RBAC 配置

### Role（命名空间范围）

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: prod
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "watch", "list"]
```

### ClusterRole（集群范围）

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: node-reader
rules:
- apiGroups: [""]
  resources: ["nodes", "namespaces"]
  verbs: ["get", "list", "watch"]
```

### RoleBinding

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: prod
  name: read-pods
subjects:
- kind: User
  name: "developer@example.com"
  apiGroup: rbac.authorization.k8s.io
- kind: ServiceAccount
  name: default
  namespace: prod
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

## Pod 安全上下文

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: my-app:v1
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop:
        - ALL
    resources:
      requests:
        memory: "64Mi"
        cpu: "50m"
      limits:
        memory: "128Mi"
        cpu: "200m"
```

## 使用 OPA Gatekeeper 的策略执行

```yaml
# 约束模板：禁止特权容器
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8spspvolumetypes
spec:
  crd:
    spec:
      names:
        kind: K8sPSPVolumeTypes
  targets:
  - target: admission.k8s.gatekeeper.sh
    rego: |
      package k8spspvolumetypes
      violation[{"msg": msg}] {
        container := input.review.object.spec.containers[_]
        volume := input.review.object.spec.volumes[_]
        volume.emptyDir {}
        msg := sprintf("不允许使用 emptyDir 卷类型: %v", [volume.name])
      }
```

## 服务网格安全（Istio）

```yaml
# PeerAuthentication：强制 mTLS
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: prod
spec:
  mtls:
    mode: STRICT
```

## 最佳实践

- 按 Namespace 隔离不同环境（dev/staging/prod）
- 仅授予最小必要权限，遵循最小特权原则
- 使用 Pod Security Admission（PSS）替代已弃用的 PSP
- 默认拒绝所有网络流量，显式声明允许
- 为所有工作负载设置 Resource Requests/Limits
- 禁止使用 latest 标签，固定镜像摘要
- 启用审计日志和运行时监控

## 合规框架

| 框架 | 关键控制点 | K8s 映射 |
|------|-----------|---------|
| CIS Kubernetes Benchmark | 1.2.x - 1.7.x | RBAC、PSP、网络策略 |
| NIST SP 800-190 | 容器安全 | Pod 安全标准、镜像扫描 |
| SOC 2 | 访问控制 | RBAC、审计日志 |
| PCI DSS | 访问控制 + 网络隔离 | NetworkPolicy、Secret 管理 |

## 故障排除

| 问题 | 排查方向 |
|------|---------|
| Pod 无法启动 | 检查 SecurityContext、ServiceAccount、镜像拉取 |
| 网络不通 | 检查 NetworkPolicy、CNI 插件、命名空间标签 |
| RBAC 拒绝 | 检查 Role/ClusterRole 绑定、ServiceAccount |
| PSP 拒绝 | 查看准入控制器日志，调整 Pod spec |
| 镜像拉取失败 | 检查 Secret、镜像仓库地址、节点网络 |

## 参考文件

- `policy/network-policies/` — 网络策略示例
- `policy/rbac/` — RBAC 配置示例
- `policy/pss/` — Pod 安全标准标签

## 相关技能

- `kubernetes-architect`：Kubernetes 架构设计
- `kubernetes-deployment`：应用部署工作流
- `k8s-manifest-generator`：清单文件生成

## 限制

- NetworkPolicy 需要支持的网络插件（Calico、Cilium 等）
- PSP 已废弃，建议迁移到 PSS
- RBAC 仅控制 Kubernetes API 访问，不控制 OS 级别权限
- 复杂多租户场景需额外配置（Namespace 边界、资源配额）
- 不替代外部安全工具（镜像扫描、运行时保护）
