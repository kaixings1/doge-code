---
name: kubernetes-部署
description: "用于容器编排、Helm chart、服务网格和生产就绪 K8s 配置的 Kubernetes 部署工作流。"
category: granular-工作流-bundle
risk: safe
source: personal
date_added: "2026-02-27"
---

# Kubernetes 部署 工作流

## 概述

专门用于部署应用到 Kubernetes 的工作流，包括容器编排、Helm chart、服务网格配置和生产就绪的 K8s 模式。

## 何时使用此工作流

在以下情况下使用此工作流：
- 部署到 Kubernetes 时
- 创建 Helm chart 时
- 配置服务网格时
- 设置 K8s 网络时
- 实施 K8s 安全时

## 工作流 Phases

### Phase 1: Container Preparation

#### Skills to Invoke
- `docker-expert` - Docker containerization
- `k8s-manifest-generator` - K8s manifests

#### Actions
1. Create Dockerfile
2. Build container image
3. Optimize image size
4. Push to registry
5. Test container

#### Copy-Paste Prompts
```
Use @docker-expert to containerize application for K8s
```

### Phase 2: K8s Manifests

#### Skills to Invoke
- `k8s-manifest-generator` - Manifest generation
- `kubernetes-architect` - K8s architecture

#### Actions
1. Create 部署
2. Configure Service
3. Set up ConfigMap
4. Create Secrets
5. Add Ingress

#### Copy-Paste Prompts
```
Use @k8s-manifest-generator to create K8s manifests
```

### Phase 3: Helm Chart

#### Skills to Invoke
- `helm-chart-scaffolding` - Helm charts

#### Actions
1. Create chart structure
2. Define values.yaml
3. Add templates
4. Configure dependencies
5. Test chart

#### Copy-Paste Prompts
```
Use @helm-chart-scaffolding to create Helm chart
```

### Phase 4: Service Mesh

#### Skills to Invoke
- `istio-traffic-management` - Istio
- `linkerd-patterns` - Linkerd
- `service-mesh-expert` - Service mesh

#### Actions
1. Choose service mesh
2. Install mesh
3. Configure traffic management
4. Set up mTLS
5. Add observability

#### Copy-Paste Prompts
```
Use @istio-traffic-management to configure Istio
```

### Phase 5: Security

#### Skills to Invoke
- `k8s-security-policies` - K8s security
- `mtls-配置` - mTLS

#### Actions
1. Configure RBAC
2. Set up NetworkPolicy
3. Enable PodSecurity
4. Configure secrets
5. Implement mTLS

#### Copy-Paste Prompts
```
Use @k8s-security-policies to secure Kubernetes cluster
```

### Phase 6: Observability

#### Skills to Invoke
- `grafana-dashboards` - Grafana
- `prometheus-配置` - Prometheus

#### Actions
1. Install monitoring stack
2. Configure Prometheus
3. Create Grafana dashboards
4. Set up alerts
5. Add distributed tracing

#### Copy-Paste Prompts
```
Use @prometheus-配置 to set up K8s monitoring
```

### Phase 7: 部署

#### Skills to Invoke
- `部署-engineer` - 部署
- `gitops-工作流` - GitOps

#### Actions
1. Configure CI/CD
2. Set up GitOps
3. Deploy to cluster
4. Verify 部署
5. Monitor rollout

#### Copy-Paste Prompts
```
Use @gitops-工作流 to implement GitOps 部署
```

## 质量门

- [ ] Containers working
- [ ] Manifests valid
- [ ] Helm chart installs
- [ ] Security configured
- [ ] Monitoring active
- [ ] 部署 successful

## Related 工作流 Bundles

- `cloud-devops` - Cloud/DevOps
- `terraform-infrastructure` - Infrastructure
- `docker-containerization` - Containers

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
