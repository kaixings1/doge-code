---
name: 创建生产就绪 Kubernetes 清单的分步指导。
description: "创建生产就绪 Kubernetes 清单的分步指导。"
risk: unknown
source: community
date_added: "2026-02-27"
---
# Kubernetes 清单生成器

创建生产就绪 Kubernetes 清单的分步指导。

## 使用此技能的情况

- 创建新的 Kubernetes 部署清单
- 定义 Service 资源
- 生成 ConfigMap 和 Secret
- 创建 PersistentVolumeClaim
- 遵循 Kubernetes 最佳实践

## 操作指南

### 1. 分析应用需求

确定容器镜像、端口、环境变量、存储需求和资源配额。

### 2. 生成 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-app
        image: my-registry/my-app:v1.0.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

### 3. 生成 Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
spec:
  selector:
    app: my-app
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP
```

### 4. 生成 ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config
data:
  APP_MODE: "production"
  LOG_LEVEL: "info"
  config.yaml: |
    server:
      port: 8080
      timeout: 30s
```

### 5. 生成 Secret

```bash
# 创建 Secret
kubectl create secret generic my-app-secrets \
  --from-literal=db-password='changeme' \
  --from-literal=api-key='changeme'
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-app-secrets
type: Opaque
stringData:
  db-password: "changeme"
  api-key: "changeme"
```

### 6. 生成 PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-storage
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: standard
```

## 资源

- [Kubernetes 官方文档](https://kubernetes.io/docs/)
- [kubectl 命令参考](https://kubernetes.io/docs/reference/kubectl/)
- [Helm Charts 文档](https://helm.sh/docs/)

## 限制

- 仅生成清单文件，不包含应用代码
- 生产环境需要额外配置监控、日志和安全策略
- 镜像仓库地址需要用户自行替换
- 复杂应用建议使用 Helm 或 Kustomize 管理
