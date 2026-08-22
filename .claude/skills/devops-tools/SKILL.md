---
name: devops-tools
description: |
  Provides tool awareness for DevOps, infrastructure, and cloud engineering tasks.
  Use when users need to work with Docker, Kubernetes, Terraform, cloud platforms,
  monitoring systems, or any DevOps-related tooling. This skill maintains a registry
  of tools organized by category and provides knowledge of commands and use cases.
Keywords: devops, docker, kubernetes, terraform, aws, gcp, azure, monitoring, ci-cd, infrastructure, cloud, containers
---

# DevOps Tools

Tool awareness registry for DevOps, infrastructure, and cloud engineering tasks.

## Categories

### Container Management

| Tool | Commands |
|------|----------|
| **Docker** | `docker run`, `docker build`, `docker ps`, `docker compose` |
| **Kubernetes** | `kubectl get pods`, `kubectl apply -f`, `kubectl describe` |

### Infrastructure as Code (IaC)

| Tool | Commands |
|------|----------|
| **Terraform** | `terraform plan`, `terraform apply`, `terraform destroy` |
| **Helm** | `helm install`, `helm upgrade`, `helm list` |
| **AWS CLI** | `aws s3 ls`, `aws ec2 describe-instances`, `aws cloudformation list` |
| **Google Cloud CLI** | `gcloud compute instances list`, `gcloud container clusters list` |

### Web Servers & Proxies

| Tool | Commands |
|------|----------|
| **Nginx** | `nginx -t`, `nginx -s reload`, `nginx -s stop` |

### Databases & Caching

| Tool | Commands |
|------|----------|
| **Redis CLI** | `redis-cli ping`, `redis-cli info`, `redis-cli keys` |
| **PostgreSQL CLI** | `psql -U`, `psql -c 'SELECT ...'`, `psql --version` |
| **Elasticsearch** | `curl -X GET localhost:9200/_cat/indices`, `curl -X POST localhost:9200/_bulk` |

### Monitoring & Logging

| Tool | Commands |
|------|----------|
| **Prometheus** | Monitor metrics collection |
| **Grafana** | Data visualization |
| **Loki** | Log aggregation |
| **Datadog** | APM monitoring |

### CI/CD

| Tool | Commands |
|------|----------|
| **Jenkins** | CI/CD server |
| **GitLab CI** | GitLab CI/CD |
| **ArgoCD** | GitOps deployment |

### Service Mesh & K8s Tooling

| Tool | Commands |
|------|----------|
| **kubebuilder** | Kubernetes project generation |
| **helm** | Kubernetes package manager |
| **istioctl** | Istio service mesh management |
| **argocd** | GitOps deployment |

### Network Tools

| Tool | Commands |
|------|----------|
| **tcpdump** | Packet capture and analysis |
| **nmap** | Network scanning |
| **curl / wget** | HTTP requests |
| **postman** | API testing |

## All Tools (JSON)

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

## Usage

When users reference DevOps tools or need to perform DevOps operations:
1. Identify the relevant tool category
2. Reference the appropriate commands
3. Provide context-aware suggestions based on the tool's use case

## Adding New Tools

To add a new tool to this registry:

```bash
# Add new tool to the tool definition file
cat ~/.doge/skills/tool_definition.json | jq '.tools |= [.tools | map(select(.name != "docker"))] + [{
  "name": "docker",
  "description": "Docker container management",
  "commands": ["docker run", "docker build", "docker ps", "docker compose"],
  "type": "devops"
}]' > temp.json && mv temp.json ~/.doge/skills/tool_definition.json
```
