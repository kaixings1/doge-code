为当前应用生成 Kubernetes 清单文件以支持部署。

## 步骤

1. 分析项目以确定部署要求：
   - 读取 `Dockerfile` 了解容器配置、暴露端口、健康检查。
   - 读取 `docker-compose.yml` 了解服务依赖。
   - 读取 `.env.example` 了解所需的环境变量。
2. 生成核心清单：
   - **Deployment**：容器规格、资源限制、就绪/存活探针、副本数。
   - **Service**：基于访问模式的 ClusterIP、NodePort 或 LoadBalancer。
   - **ConfigMap**：非敏感配置值。
   - **Secret**：敏感值（模板化，非真实值）。
   - **Ingress**：如果服务需要外部访问，带 TLS 配置。
3. 根据需要添加运维清单：
   - **HorizontalPodAutoscaler**：基于 CPU/内存的扩缩规则。
   - **PodDisruptionBudget**：更新期间的最低可用性。
   - **NetworkPolicy**：将流量限制到必要路径。
   - **ServiceAccount**：具有最小 RBAC 权限。
4. 基于应用类型设置资源请求和限制。
5. 将清单写入 `k8s/` 或 `deploy/k8s/` 目录。
6. 如果 kubectl 可用，使用 `kubectl --dry-run=client -f <file>` 验证。

## 格式

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <应用名称>
  namespace: <命名空间>
  labels:
    app: <应用名称>
spec:
  replicas: <副本数>
  selector:
    matchLabels:
      app: <应用名称>
  template:
    spec:
      containers:
        - name: <应用名称>
          image: <仓库>/<镜像>:<标签>
          ports:
            - containerPort: <端口>
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
```

## 规则

- 始终在每个容器上设置资源请求和限制。
- 绝不在清单中硬编码密钥；使用 Secret 引用或外部密钥管理器。
- 为每个服务容器包含就绪和存活探针。
- 默认使用 `maxSurge: 1` 和 `maxUnavailable: 0` 的 `RollingUpdate` 策略。
- 为每个资源清单添加命名空间。
