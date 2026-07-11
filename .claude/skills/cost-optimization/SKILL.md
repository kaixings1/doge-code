---
name: 优化 AWS、Azure 和 GCP 云成本的策略和模式。
description: "优化 AWS、Azure 和 GCP 云成本的策略和模式。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# 云成本优化

优化 AWS、Azure 和 GCP 云成本的策略和模式。

## 不要使用此技能的场景

- 任务与云成本优化无关时
- 需要此范围之外的领域或工具时

## 说明

- 明确目标、约束和所需输入。
- 应用相关最佳实践并验证结果。
- 提供可操作的步骤和验证方法。
- 如需详细示例，请打开 `resources/implementation-playbook.md`。

## 目的

实施系统化的成本优化策略，在保持性能和可靠性的同时减少云支出。

## 使用此技能的场景

- 减少云支出
- 合理调整资源规模
- 实施成本治理
- 优化多云成本
- 满足预算限制

## 成本优化框架

### 1. 可视化
- 实施成本分配标签
- 使用云成本管理工具
- 设置预算告警
- 创建成本仪表盘

### 2. 合理规模
- 分析资源利用率
- 缩减过度配置的资源
- 使用自动扩展
- 移除闲置资源

### 3. 定价模式
- 使用预留容量
- 利用竞价/抢占式实例
- 实施储蓄计划
- 使用承诺使用折扣

### 4. 架构优化
- 使用托管服务
- 实施缓存
- 优化数据传输
- 使用生命周期策略

## AWS 成本优化

### 预留实例
```
节省：与按需相比 30-72%
期限：1 年或 3 年
付款：全部/部分/无预付款
灵活性：标准或可转换
```

### 储蓄计划
```
计算储蓄计划：节省 66%
EC2 实例储蓄计划：节省 72%
适用于：EC2、Fargate、Lambda
灵活跨：实例系列、区域、操作系统
```

### 竞价实例
```
节省：与按需相比高达 90%
最佳用途：批处理作业、CI/CD、无状态工作负载
风险：2 分钟中断通知
策略：与按需混用以增强弹性
```

### S3 Cost Optimization
```hcl
resource "aws_s3_bucket_lifecycle_configuration" "example" {
  bucket = aws_s3_bucket.example.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}
```

## Azure 成本优化

### 预留 VM 实例
- 1 年或 3 年期限
- 高达 72% 的节省
- 灵活调整大小
- 可交换

### Azure 混合权益
- 使用现有 Windows Server 许可证
- 结合 RI 高达 80% 的节省
- 适用于 Windows 和 SQL Server

### Azure Advisor 建议
- 合理调整 VM 规模
- 删除未使用的资源
- 使用预留容量
- 优化存储

## GCP 成本优化

### 承诺使用折扣
- 1 年或 3 年承诺
- 高达 57% 的节省
- 适用于 vCPU 和内存
- 基于资源或基于支出

### 持续使用折扣
- 自动折扣
- 运行实例高达 30%
- 无需承诺
- 适用于 Compute Engine、GKE

### 抢占式 VM
- 高达 80% 的节省
- 最长 24 小时运行时间
- 最适合批处理工作负载

## Tagging Strategy

### AWS Tagging
```hcl
locals {
  common_tags = {
    Environment = "production"
    Project     = "my-project"
    CostCenter  = "engineering"
    Owner       = "team@example.com"
    ManagedBy   = "terraform"
  }
}

resource "aws_instance" "example" {
  ami           = "ami-12345678"
  instance_type = "t3.medium"

  tags = merge(
    local.common_tags,
    {
      Name = "web-server"
    }
  )
}
```

**Reference:** See `references/tagging-standards.md`

## 成本监控

### 预算告警
```hcl
# AWS Budget
resource "aws_budgets_budget" "monthly" {
  name              = "monthly-budget"
  budget_type       = "COST"
  limit_amount      = "1000"
  limit_unit        = "USD"
  time_period_start = "2024-01-01_00:00"
  time_unit         = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = ["team@example.com"]
  }
}
```

### 成本异常检测
- AWS Cost Anomaly Detection
- Azure Cost Management 告警
- GCP Budget 告警

## 架构模式

### 模式 1：无服务器优先
- 使用 Lambda/Functions 处理事件驱动型工作负载
- 仅按执行时间付费
- 包含自动扩展
- 无空闲成本

### 模式 2：合理规模的数据库
```
开发环境：t3.small RDS
预发布：t3.large RDS
生产环境：r6g.2xlarge RDS 配合只读副本
```

### 模式 3：多层存储
```
热数据：S3 Standard
温数据：S3 Standard-IA（30 天）
冷数据：S3 Glacier（90 天）
归档：S3 Deep Archive（365 天）
```

### 模式 4：自动扩展
```hcl
resource "aws_autoscaling_policy" "scale_up" {
  name                   = "scale-up"
  scaling_adjustment     = 2
  adjustment_type        = "ChangeInCapacity"
  cooldown              = 300
  autoscaling_group_name = aws_autoscaling_group.main.name
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "60"
  statistic           = "Average"
  threshold           = "80"
  alarm_actions       = [aws_autoscaling_policy.scale_up.arn]
}
```

## 成本优化检查清单

- [ ] 实施成本分配标签
- [ ] 删除未使用的资源（EBS、EIP、快照）
- [ ] 基于利用率合理调整实例规模
- [ ] 为稳定工作负载使用预留容量
- [ ] 实施自动扩展
- [ ] 优化存储类别
- [ ] 使用生命周期策略
- [ ] 启用成本异常检测
- [ ] 设置预算告警
- [ ] 每周审查成本
- [ ] 使用竞价/抢占式实例
- [ ] 优化数据传输成本
- [ ] 实施缓存层
- [ ] 使用托管服务
- [ ] 持续监控和优化

## 工具

- **AWS：** Cost Explorer、Cost Anomaly Detection、Compute Optimizer
- **Azure：** Cost Management、Advisor
- **GCP：** Cost Management、Recommender
- **多云：** CloudHealth、Cloudability、Kubecost

## 参考文件

- `references/tagging-standards.md` - Tagging conventions
- `assets/cost-analysis-template.xlsx` - Cost analysis spreadsheet

## 相关 Skills

- `terraform-module-library` - For resource provisioning
- `multi-cloud-architecture` - For cloud selection

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
