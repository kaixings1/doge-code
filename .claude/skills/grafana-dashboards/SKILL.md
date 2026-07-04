---
name: grafana-dashboards
description: "创建和管理生产就绪的 Grafana 仪表板以实现全面的系统可观察性。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Grafana 仪表板

创建和管理生产就绪的 Grafana 仪表板，实现全面的系统可观测性。

## 何时不使用本技能

- 任务与 grafana 仪表板无关
- 您需要此范围之外的不同领域或工具

## 使用说明

- 明确目标、约束和所需的输入。
- 应用相关的最佳实践并验证结果。
- 提供可操作的步骤和验证方法。
- 如果需要详细示例，请打开 `resources/implementation-playbook.md`。

## 目的

设计有效的 Grafana 仪表板，用于监控应用程序、基础设施和业务指标。

## 何时使用本技能

- 可视化 Prometheus 指标
- 创建自定义仪表板
- 实施 SLO 仪表板
- 监控基础设施
- 跟踪业务 KPI

## 仪表板设计原则

### 1. 信息层级
```
┌─────────────────────────────────────┐
│  关键指标（大数字）                    │
├─────────────────────────────────────┤
│  主要趋势（时间序列）                  │
├─────────────────────────────────────┤
│  详细指标（表格/热力图）               │
└─────────────────────────────────────┘
```

### 2. RED 方法（服务）
- **速率（Rate）** - 每秒请求数
- **错误（Errors）** - 错误率
- **耗时（Duration）** - 延迟/响应时间

### 3. USE 方法（资源）
- **利用率（Utilization）** - 资源忙碌时间百分比
- **饱和度（Saturation）** - 队列长度/等待时间
- **错误（Errors）** - 错误计数

## 仪表板结构

### API 监控仪表板

```json
{
  "dashboard": {
    "title": "API Monitoring",
    "tags": ["api", "production"],
    "timezone": "browser",
    "refresh": "30s",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (service)",
            "legendFormat": "{{service}}"
          }
        ],
        "gridPos": {"x": 0, "y": 0, "w": 12, "h": 8}
      },
      {
        "title": "Error Rate %",
        "type": "graph",
        "targets": [
          {
            "expr": "(sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))) * 100",
            "legendFormat": "Error Rate"
          }
        ],
        "alert": {
          "conditions": [
            {
              "evaluator": {"params": [5], "type": "gt"},
              "operator": {"type": "and"},
              "query": {"params": ["A", "5m", "now"]},
              "type": "query"
            }
          ]
        },
        "gridPos": {"x": 12, "y": 0, "w": 12, "h": 8}
      },
      {
        "title": "P95 Latency",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))",
            "legendFormat": "{{service}}"
          }
        ],
        "gridPos": {"x": 0, "y": 8, "w": 24, "h": 8}
      }
    ]
  }
}
```

**Reference:** See `assets/api-dashboard.json`

## 面板类型

### 1. 统计面板（单值）
```json
{
  "type": "stat",
  "title": "总请求数",
  "targets": [{
    "expr": "sum(http_requests_total)"
  }],
  "options": {
    "reduceOptions": {
      "values": false,
      "calcs": ["lastNotNull"]
    },
    "orientation": "auto",
    "textMode": "auto",
    "colorMode": "value"
  },
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          {"value": 0, "color": "green"},
          {"value": 80, "color": "yellow"},
          {"value": 90, "color": "red"}
        ]
      }
    }
  }
}
```

### 2. 时间序列图
```json
{
  "type": "graph",
  "title": "CPU 使用率",
  "targets": [{
    "expr": "100 - (avg by (instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)"
  }],
  "yaxes": [
    {"format": "percent", "max": 100, "min": 0},
    {"format": "short"}
  ]
}
```

### 3. 表格面板
```json
{
  "type": "table",
  "title": "服务状态",
  "targets": [{
    "expr": "up",
    "format": "table",
    "instant": true
  }],
  "transformations": [
    {
      "id": "organize",
      "options": {
        "excludeByName": {"Time": true},
        "indexByName": {},
        "renameByName": {
          "instance": "Instance",
          "job": "Service",
          "Value": "Status"
        }
      }
    }
  ]
}
```

### 4. 热力图
```json
{
  "type": "heatmap",
  "title": "延迟热力图",
  "targets": [{
    "expr": "sum(rate(http_request_duration_seconds_bucket[5m])) by (le)",
    "format": "heatmap"
  }],
  "dataFormat": "tsbuckets",
  "yAxis": {
    "format": "s"
  }
}
```

## 变量

### 查询变量
```json
{
  "templating": {
    "list": [
      {
        "name": "namespace",
        "type": "query",
        "datasource": "Prometheus",
        "query": "label_values(kube_pod_info, namespace)",
        "refresh": 1,
        "multi": false
      },
      {
        "name": "service",
        "type": "query",
        "datasource": "Prometheus",
        "query": "label_values(kube_service_info{namespace=\"$namespace\"}, service)",
        "refresh": 1,
        "multi": true
      }
    ]
  }
}
```

### 在查询中使用变量
```
sum(rate(http_requests_total{namespace="$namespace", service=~"$service"}[5m]))
```

## 仪表板中的告警

```json
{
  "alert": {
    "name": "High Error Rate",
    "conditions": [
      {
        "evaluator": {
          "params": [5],
          "type": "gt"
        },
        "operator": {"type": "and"},
        "query": {
          "params": ["A", "5m", "now"]
        },
        "reducer": {"type": "avg"},
        "type": "query"
      }
    ],
    "executionErrorState": "alerting",
    "for": "5m",
    "frequency": "1m",
    "message": "Error rate is above 5%",
    "noDataState": "no_data",
    "notifications": [
      {"uid": "slack-channel"}
    ]
  }
}
```

## 仪表板配置管理

**dashboards.yml:**
```yaml
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: 'General'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/dashboards
```

## 常见仪表板模式

### 基础设施仪表板

**关键面板：**
- 每个节点的 CPU 利用率
- 每个节点的内存使用率
- 磁盘 I/O
- 网络流量
- 按命名空间的 Pod 数量
- 节点状态

**参考：** 查看 `assets/infrastructure-dashboard.json`

### 数据库仪表板

**关键面板：**
- 每秒查询数
- 连接池使用率
- 查询延迟（P50、P95、P99）
- 活跃连接数
- 数据库大小
- 复制延迟
- 慢查询

**参考：** 查看 `assets/database-dashboard.json`

### 应用仪表板

**关键面板：**
- 请求速率
- 错误率
- 响应时间（百分位数）
- 活跃用户/会话数
- 缓存命中率
- 队列长度

## 最佳实践

1. **从模板开始**（Grafana 社区仪表板）
2. **对面板和变量使用一致命名**
3. **将相关指标分组到行中**
4. **设置适当的时间范围**（默认：过去 6 小时）
5. **使用变量提高灵活性**
6. **添加面板说明以提供上下文**
7. **正确配置单位**
8. **为颜色设置有意义的阈值**
9. **在仪表板间使用一致的颜色**
10. **使用不同的时间范围进行测试**

## 仪表板即代码

### Terraform 配置管理

```hcl
resource "grafana_dashboard" "api_monitoring" {
  config_json = file("${path.module}/dashboards/api-monitoring.json")
  folder      = grafana_folder.monitoring.id
}

resource "grafana_folder" "monitoring" {
  title = "Production Monitoring"
}
```

### Ansible 配置管理

```yaml
- name: Deploy Grafana dashboards
  copy:
    src: "{{ item }}"
    dest: /etc/grafana/dashboards/
  with_fileglob:
    - "dashboards/*.json"
  notify: restart grafana
```

## 参考文件

- `assets/api-dashboard.json` - API 监控仪表板
- `assets/infrastructure-dashboard.json` - 基础设施仪表板
- `assets/database-dashboard.json` - 数据库监控仪表板
- `references/dashboard-design.md` - 仪表板设计指南

## 相关技能

- `prometheus-configuration` - 用于指标收集
- `slo-implementation` - 用于 SLO 仪表板

## 局限性
- 仅当任务明确匹配上述范围时使用本技能。
- 不要将输出视为环境特定验证、测试或专家评审的替代品。
- 如果缺少所需的输入、权限、安全边界或成功标准，请停下来寻求澄清。
