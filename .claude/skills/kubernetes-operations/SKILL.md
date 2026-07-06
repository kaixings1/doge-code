---
name: kubernetes-operations
description: Kubernetes运维 — 包括清单、Helm图表、Operator模式、网络策略和存储。
---

# Kubernetes Operations

## 部署 Manifest

```yaml
apiVersion: apps/v1
kind: 部署
metadata:
  name: api-server
  labels:
    app: api-server
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
        version: v1
    spec:
      containers:
        - name: api
          image: registry.example.com/api:1.2.0
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: api-server
```

始终设置资源请求和限制。使用拓扑分布约束以实现高可用性。

## Helm Chart 结构

```
chart/
  Chart.yaml
  values.yaml
  values-staging.yaml
  values-production.yaml
  templates/
    部署.yaml
    service.yaml
    ingress.yaml
    hpa.yaml
    _helpers.tpl
```

```yaml
# values.yaml
replicaCount: 2
image:
  repository: registry.example.com/api
  tag: "1.2.0"
  pullPolicy: IfNotPresent
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilization: 70
```

## HorizontalPodAutoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: 部署
    name: api-server
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
```

## 故障排除 Commands

```bash
# Pod diagnostics
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -c <container> --previous
kubectl exec -it <pod-name> -- /bin/sh

# Resource usage
kubectl top pods -n <namespace> --sort-by=memory
kubectl top nodes

# Network debugging
kubectl run debug --image=nicolaka/netshoot --rm -it -- bash
nslookup <service-name>.<namespace>.svc.cluster.local

# Events sorted by time
kubectl get events -n <namespace> --sort-by='.lastTimestamp'

# Find pods not running
kubectl get pods -A --field-selector=status.phase!=Running
```

## 反模式

- 在没有 `security上下文.runAsNonRoot: true` 的情况下以 root 身份运行容器
- 缺少资源请求/限制（导致调度问题和"吵闹的邻居"问题）
- 使用 `latest` 标签而不是固定的镜像版本
- 没有为关键工作负载设置 `PodDisruptionBudget`
- 将密钥存储在 ConfigMaps 而不是 Secrets（或外部密钥管理器）中
- 忽略复制部署的 pod 反亲和性

## Checklist

- [ ] All containers have resource requests and limits
- [ ] Liveness and readiness probes configured
- [ ] Images use specific version tags, not `latest`
- [ ] Secrets stored in Kubernetes Secrets or external vault
- [ ] PodDisruptionBudget set for production workloads
- [ ] NetworkPolicies restrict traffic between namespaces
- [ ] Topology spread constraints or anti-affinity for HA
- [ ] Helm values split per environment (staging, production)
