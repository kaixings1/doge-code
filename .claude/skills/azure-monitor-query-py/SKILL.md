---
name: azure-monitor-查询-py
description: "Azure Monitor 查询 Py — Azure Monitor 查询 Py 相关功能和最佳实践"
risk: unknown
source: community
date_added: '2026-02-27'
---

# Azure Monitor 查询 SDK for Python

查询 logs and metrics from Azure Monitor and Log Analytics workspaces.

## 安装

```bash
pip install azure-monitor-查询
```

## 环境变量

```bash
# Log Analytics
AZURE_LOG_ANALYTICS_WORKSPACE_ID=<workspace-id>

# Metrics
AZURE_METRICS_RESOURCE_URI=/subscriptions/<sub>/resourceGroups/<rg>/providers/<provider>/<type>/<name>
```

## 认证

```python
from azure.identity import DefaultAzureCredential

credential = DefaultAzureCredential()
```

## Logs 查询 Client

### Basic 查询

```python
from azure.monitor.查询 import LogsQueryClient
from datetime import timedelta

client = LogsQueryClient(credential)

查询 = """
AppRequests
| where TimeGenerated > ago(1h)
| summarize count() by bin(TimeGenerated, 5m), ResultCode
| order by TimeGenerated desc
"""

响应 = client.query_workspace(
    workspace_id=os.environ["AZURE_LOG_ANALYTICS_WORKSPACE_ID"],
    查询=查询,
    timespan=timedelta(hours=1)
)

for table in 响应.tables:
    for row in table.rows:
        print(row)
```

### 查询 with Time Range

```python
from datetime import datetime, timezone

响应 = client.query_workspace(
    workspace_id=workspace_id,
    查询="AppRequests | take 10",
    timespan=(
        datetime(2024, 1, 1, tzinfo=timezone.utc),
        datetime(2024, 1, 2, tzinfo=timezone.utc)
    )
)
```

### Convert to DataFrame

```python
import pandas as pd

响应 = client.query_workspace(workspace_id, 查询, timespan=timedelta(hours=1))

if 响应.tables:
    table = 响应.tables[0]
    df = pd.DataFrame(data=table.rows, columns=[col.name for col in table.columns])
    print(df.head())
```

### Batch 查询

```python
from azure.monitor.查询 import LogsBatchQuery

queries = [
    LogsBatchQuery(workspace_id=workspace_id, 查询="AppRequests | take 5", timespan=timedelta(hours=1)),
    LogsBatchQuery(workspace_id=workspace_id, 查询="AppExceptions | take 5", timespan=timedelta(hours=1))
]

responses = client.query_batch(queries)

for 响应 in responses:
    if 响应.tables:
        print(f"Rows: {len(响应.tables[0].rows)}")
```

### Handle Partial Results

```python
from azure.monitor.查询 import LogsQueryStatus

响应 = client.query_workspace(workspace_id, 查询, timespan=timedelta(hours=24))

if 响应.status == LogsQueryStatus.PARTIAL:
    print(f"Partial results: {响应.partial_error}")
elif 响应.status == LogsQueryStatus.FAILURE:
    print(f"查询 failed: {响应.partial_error}")
```

## Metrics 查询 Client

### 查询 Resource Metrics

```python
from azure.monitor.查询 import MetricsQueryClient
from datetime import timedelta

metrics_client = MetricsQueryClient(credential)

响应 = metrics_client.query_resource(
    resource_uri=os.environ["AZURE_METRICS_RESOURCE_URI"],
    metric_names=["Percentage CPU", "Network In Total"],
    timespan=timedelta(hours=1),
    granularity=timedelta(minutes=5)
)

for metric in 响应.metrics:
    print(f"{metric.name}:")
    for time_series in metric.timeseries:
        for data in time_series.data:
            print(f"  {data.timestamp}: {data.average}")
```

### Aggregations

```python
from azure.monitor.查询 import MetricAggregationType

响应 = metrics_client.query_resource(
    resource_uri=resource_uri,
    metric_names=["Requests"],
    timespan=timedelta(hours=1),
    aggregations=[
        MetricAggregationType.AVERAGE,
        MetricAggregationType.MAXIMUM,
        MetricAggregationType.MINIMUM,
        MetricAggregationType.COUNT
    ]
)
```

### 过滤器 by Dimension

```python
响应 = metrics_client.query_resource(
    resource_uri=resource_uri,
    metric_names=["Requests"],
    timespan=timedelta(hours=1),
    过滤器="ApiName eq 'GetBlob'"
)
```

### List Metric Definitions

```python
definitions = metrics_client.list_metric_definitions(resource_uri)
for definition in definitions:
    print(f"{definition.name}: {definition.unit}")
```

### List Metric Namespaces

```python
namespaces = metrics_client.list_metric_namespaces(resource_uri)
for ns in namespaces:
    print(ns.fully_qualified_namespace)
```

## Async Clients

```python
from azure.monitor.查询.aio import LogsQueryClient, MetricsQueryClient
from azure.identity.aio import DefaultAzureCredential

async def query_logs():
    credential = DefaultAzureCredential()
    client = LogsQueryClient(credential)
    
    响应 = await client.query_workspace(
        workspace_id=workspace_id,
        查询="AppRequests | take 10",
        timespan=timedelta(hours=1)
    )
    
    await client.close()
    await credential.close()
    return 响应
```

## Common Kusto Queries

```kusto
// Requests by status code
AppRequests
| summarize count() by ResultCode
| order by count_ desc

// Exceptions over time
AppExceptions
| summarize count() by bin(TimeGenerated, 1h)

// Slow requests
AppRequests
| where DurationMs > 1000
| project TimeGenerated, Name, DurationMs
| order by DurationMs desc

// Top errors
AppExceptions
| summarize count() by ExceptionType
| top 10 by count_
```

## 客户端类型

| Client | Purpose |
|--------|---------|
| `LogsQueryClient` | 查询 Log Analytics workspaces |
| `MetricsQueryClient` | 查询 Azure Monitor metrics |

## 最佳实践

1. **Use timedelta** for relative time ranges
2. **Handle partial results** for large queries
3. **Use batch queries** when running multiple queries
4. **Set appropriate granularity** for metrics to reduce data points
5. **Convert to DataFrame** for easier data analysis
6. **Use aggregations** to summarize metric data
7. **过滤器 by dimensions** to narrow metric results

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
