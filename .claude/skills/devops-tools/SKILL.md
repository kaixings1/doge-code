---
name: devops-tools
description: "为 DevOps、基础设施和云工程任务提供工具感知。在用户需要与 Docker、Kubernetes、Terraform、云平台协作时使用。为 DevOps、基础设施与云工程任务提供工具感知。当用户需要与 Docker、Kubernetes、Terraform、云平台、监控系统或任何 DevOps 相关工具协作时使用。此技能维护一个按类别组织的工具注册表，并提供命令与用例方面的知识。"
Keywords: devops, docker, kubernetes, terraform, aws, gcp, azure, monitoring, ci-cd, infrastructure, cloud, containers
---

# DevOps 工具

面向 DevOps、基础设施与云工程任务的工具感知注册表。

## 类别

### 容器管理

| 工具 | 命令 |
|------|----------|
| **Docker** | `docker run`, `docker build`, `docker ps`, `docker compose` |
| **Kubernetes** | `kubectl get pods`, `kubectl apply -f`, `kubectl describe` |

### 基础设施即代码（IaC）

| 工具 | 命令 |
|------|----------|
| **Terraform** | `terraform plan`, `terraform apply`, `terraform destroy` |
| **Helm** | `helm install`, `helm upgrade`, `helm list` |
| **AWS CLI** | `aws s3 ls`, `aws ec2 describe-instances`, `aws cloudformation list` |
| **Google Cloud CLI** | `gcloud compute instances list`, `gcloud container clusters list` |

### Web 服务器与代理

| 工具 | 命令 |
|------|----------|
| **Nginx** | `nginx -t`, `nginx -s reload`, `nginx -s stop` |

### 数据库与缓存

| 工具 | 命令 |
|------|----------|
| **Redis CLI** | `redis-cli ping`, `redis-cli info`, `redis-cli keys` |
| **PostgreSQL CLI** | `psql -U`, `psql -c 'SELECT ...'`, `psql --version` |
| **Elasticsearch** | `curl -X GET localhost:9200/_cat/indices`, `curl -X POST localhost:9200/_bulk` |

### 监控与日志

| 工具 | 命令 |
|------|----------|
| **Prometheus** | 监控指标采集 |
| **Grafana** | 数据可视化 |
| **Loki** | 日志聚合 |
| **Datadog** | APM 监控 |

### CI/CD

| 工具 | 命令 |
|------|----------|
| **Jenkins** | CI/CD 服务器 |
| **GitLab CI** | GitLab CI/CD |
| **ArgoCD** | GitOps 部署 |

### 服务网格与 K8s 工具

| 工具 | 命令 |
|------|----------|
| **kubebuilder** | Kubernetes 项目生成 |
| **helm** | Kubernetes 包管理器 |
| **istioctl** | Istio 服务网格管理 |
| **argocd** | GitOps 部署 |

### 网络工具

| 工具 | 命令 |
|------|----------|
| **tcpdump** | 数据包捕获与分析 |
| **nmap** | 网络扫描 |
| **curl / wget** | HTTP 请求 |
| **postman** | API 测试 |

## 全部工具（JSON）

```json
[
  "docker",
  "kubernetes",
  "terraform",
  "aws-cli",
  "gcloud",
  "nginx",
  "redis-cli",
  "postgres-cli",
  "elasticsearch",
  "prometheus",
  "grafana",
  "loki",
  "datadog"
]
```

## 使用方式

当用户提及 DevOps 工具或需要执行 DevOps 操作时：
1. 确定相关的工具类别
2. 参考相应的命令
3. 结合工具的用例给出具备上下文感知的建议

## 添加新工具

如需向此注册表添加新工具：

```bash
# 向工具定义文件添加新工具
cat ~/.doge/skills/tool_definition.json | jq '.tools |= [.tools | map(select(.name != "docker"))] + [{
  "name": "docker",
  "description": "Docker 容器管理",
  "commands": ["docker run", "docker build", "docker ps", "docker compose"],
  "type": "devops"
}]' > temp.json && mv temp.json ~/.doge/skills/tool_definition.json
```
