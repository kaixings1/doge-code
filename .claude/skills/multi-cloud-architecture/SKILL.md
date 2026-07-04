---
name: multi-cloud-architecture
description: "在 AWS、Azure 和 GCP 上架构应用的决策框架和模式。"
risk: safe
source: community
date_added: "2026-02-27"
---

# 多云架构

在 AWS、Azure 和 GCP 上架构应用的决策框架和模式。

## 使用时机
- 设计多云策略
- 在云提供商之间迁移
- 为特定工作负载选择云服务
- 实现云无关架构
- 优化跨提供商的成本

## 不使用时机
- 任务与多云架构无关
- 需要此范围之外的不同领域或工具

## 使用说明
- 明确目标、约束和所需输入。
- 应用相关最佳实践并验证结果。
- 提供可操作的步骤和验证。

## 目的
设计云无关架构，并在跨云提供商的服务选择方面做出明智决策。

## 云服务比较
### 计算服务
| AWS | Azure | GCP | 用途 |
|-----|-------|-----|------|
| EC2 | Virtual Machines | Compute Engine | 通用虚拟机 |
| Lambda | Functions | Cloud Functions | 无服务器函数 |
| ECS/EKS | AKS | GKE | 容器编排 |
| Fargate | Container Instances | Cloud Run | 无服务器容器 |
| Lightsail | App Service | App Engine | 平台即服务 |

### 存储服务
| AWS | Azure | GCP | 用途 |
|-----|-------|-----|------|
| S3 | Blob Storage | Cloud Storage | 对象存储 |
| EBS | Disk Storage | Persistent Disk | 块存储 |
| EFS | Files | Filestore | 文件存储 |
| Glacier | Archive Storage | Archive Storage | 归档存储 |

### 数据库服务
| AWS | Azure | GCP | 用途 |
|-----|-------|-----|------|
| RDS | SQL Database | Cloud SQL | 关系型数据库 |
| DynamoDB | Cosmos DB | Firestore | NoSQL 数据库 |
| ElastiCache | Cache for Redis | Memorystore | 缓存 |
| Redshift | Synapse | BigQuery | 数据仓库 |
| Neptune | Gremlin API | - | 图数据库 |
| DocumentDB | MongoDB API | - | 文档数据库 |

### 网络服务
| AWS | Azure | GCP | 用途 |
|-----|-------|-----|------|
| VPC | Virtual Network | VPC | 虚拟网络 |
| CloudFront | CDN | Cloud CDN | 内容分发网络 |
| Route 53 | DNS | Cloud DNS | DNS 服务 |
| Direct Connect | ExpressRoute | Interconnect | 专线连接 |
| ALB/NLB | Load Balancer | Cloud Load Balancing | 负载均衡 |
| API Gateway | API Management | Apigee | API 管理 |

## 架构模式
### 多云部署策略
1. 主/备：主用 AWS，GCP 作为灾难恢复
2. 地理分布：基于用户位置路由到最近的云
3. 服务拆分：不同云托管不同服务
4. 抽象层：使用 Kubernetes 或抽象框架统一管理

## 设计原则
- 使用云无关的 API 和 SDK
- 通过抽象层避免供应商锁定
- 使用 Terraform/Crossplane 实现基础设施即代码
- 实施全面的监控和日志策略
- 设计故障转移和灾难恢复机制
- 优化跨云数据传输成本
- 实施一致的安全策略和身份管理
- 使用服务网格实现统一的服务通信

## 限制
- 仅在任务明确匹配上述范围时使用此技能。
- 请勿将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必需的输入、权限、安全边界或成功标准，请停止并请求澄清。